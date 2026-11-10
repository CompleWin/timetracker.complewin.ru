import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { db } from "./db.ts";

export type Row = Record<string, unknown>;

export type Snapshot = Map<string, Row[]>;

export type SnapshotEdit = (snapshot: Snapshot) => void;

type Column = {
  name: string;
  notnull: number;
  dflt_value: string | null;
};

const DROPPED_COLUMN_VALUE = 0;

const LAST_MIGRATION_BEFORE_AUTO_IMPORT = "0011_telegram_bot.sql";
const LAST_MIGRATION_BEFORE_PAGES_ONLY = "0012_notion_auto_import.sql";
const TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name != 'd1_migrations'";

export function replayAutoImportMigrations(): Promise<void> {
  return replayMigrationsAfter(LAST_MIGRATION_BEFORE_AUTO_IMPORT);
}

export function replayPagesOnlyMigration(edit: SnapshotEdit): Promise<void> {
  return replayMigrationsAfter(LAST_MIGRATION_BEFORE_PAGES_ONLY, edit);
}

export function clearValuesInRowsOf(
  referencedId: string,
  shouldClear: (value: string) => boolean,
): SnapshotEdit {
  return (snapshot) => {
    const rows = [...snapshot.values()].flat().filter((row) => references(row, referencedId));
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value === "string" && shouldClear(value)) row[column] = null;
      }
    }
  };
}

function references(row: Row, id: string): boolean {
  return Object.values(row).includes(id);
}

async function replayMigrationsAfter(
  lastKeptMigration: string,
  edit: SnapshotEdit = () => {},
): Promise<void> {
  const snapshot = await readAllRows();
  edit(snapshot);
  await reset();
  await applyD1Migrations(env.DB, migrationsUpTo(lastKeptMigration));
  await restoreRows(snapshot);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

function migrationsUpTo(lastKeptMigration: string): typeof env.TEST_MIGRATIONS {
  const lastIndex = env.TEST_MIGRATIONS.findIndex(({ name }) => name === lastKeptMigration);
  if (lastIndex === -1) throw new Error(`No migration ${lastKeptMigration}`);
  return env.TEST_MIGRATIONS.slice(0, lastIndex + 1);
}

async function tableNames(): Promise<string[]> {
  const tables = await db.all<{ name: string }>(TABLES_SQL);
  return tables.map(({ name }) => name);
}

async function readAllRows(): Promise<Snapshot> {
  const snapshot: Snapshot = new Map();
  for (const table of await tableNames()) {
    snapshot.set(table, await db.all(`SELECT * FROM "${table}"`));
  }
  return snapshot;
}

async function columnsOf(table: string): Promise<Column[]> {
  return db.all<Column>(`PRAGMA table_info("${table}")`);
}

function isRequiredWithoutDefault({ notnull, dflt_value }: Column): boolean {
  return notnull === 1 && dflt_value === null;
}

function rowForColumns(columns: Column[], row: Row): Row {
  const filled: Row = {};
  for (const column of columns) {
    if (column.name in row) filled[column.name] = row[column.name];
    else if (isRequiredWithoutDefault(column)) filled[column.name] = DROPPED_COLUMN_VALUE;
  }
  return filled;
}

function insertStatement(table: string, columns: Column[], row: Row): D1PreparedStatement {
  const values = rowForColumns(columns, row);
  const names = Object.keys(values)
    .map((column) => `"${column}"`)
    .join(", ");
  const slots = Object.keys(values)
    .map(() => "?")
    .join(", ");
  return env.DB.prepare(`INSERT INTO "${table}" (${names}) VALUES (${slots})`).bind(
    ...Object.values(values),
  );
}

async function restoreRows(snapshot: Snapshot): Promise<void> {
  const inserts: D1PreparedStatement[] = [];
  for (const table of await tableNames()) {
    const columns = await columnsOf(table);
    const rows = snapshot.get(table) ?? [];
    inserts.push(...rows.map((row) => insertStatement(table, columns, row)));
  }
  await env.DB.batch([env.DB.prepare("PRAGMA defer_foreign_keys = on"), ...inserts]);
}
