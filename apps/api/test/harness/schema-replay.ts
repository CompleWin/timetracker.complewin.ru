import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { db } from "./db.ts";

type Row = Record<string, unknown>;

const LAST_MIGRATION_BEFORE_AUTO_IMPORT = "0011_telegram_bot.sql";
const TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name != 'd1_migrations'";

export async function replayAutoImportMigrations(): Promise<void> {
  const snapshot = await readAllRows();
  await reset();
  await applyD1Migrations(env.DB, migrationsBeforeAutoImport());
  await restoreRows(snapshot);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

function migrationsBeforeAutoImport(): typeof env.TEST_MIGRATIONS {
  const lastIndex = env.TEST_MIGRATIONS.findIndex(
    ({ name }) => name === LAST_MIGRATION_BEFORE_AUTO_IMPORT,
  );
  if (lastIndex === -1) throw new Error(`No migration ${LAST_MIGRATION_BEFORE_AUTO_IMPORT}`);
  return env.TEST_MIGRATIONS.slice(0, lastIndex + 1);
}

async function tableNames(): Promise<string[]> {
  const tables = await db.all<{ name: string }>(TABLES_SQL);
  return tables.map(({ name }) => name);
}

async function readAllRows(): Promise<Map<string, Row[]>> {
  const snapshot = new Map<string, Row[]>();
  for (const table of await tableNames()) {
    snapshot.set(table, await db.all(`SELECT * FROM "${table}"`));
  }
  return snapshot;
}

async function columnNames(table: string): Promise<string[]> {
  const columns = await db.all<{ name: string }>(`PRAGMA table_info("${table}")`);
  return columns.map(({ name }) => name);
}

function insertStatement(table: string, columns: string[], row: Row): D1PreparedStatement {
  const known = columns.filter((column) => column in row);
  const names = known.map((column) => `"${column}"`).join(", ");
  const slots = known.map(() => "?").join(", ");
  return env.DB.prepare(`INSERT INTO "${table}" (${names}) VALUES (${slots})`).bind(
    ...known.map((column) => row[column]),
  );
}

async function restoreRows(snapshot: Map<string, Row[]>): Promise<void> {
  const inserts: D1PreparedStatement[] = [];
  for (const table of await tableNames()) {
    const columns = await columnNames(table);
    const rows = snapshot.get(table) ?? [];
    inserts.push(...rows.map((row) => insertStatement(table, columns, row)));
  }
  await env.DB.batch([env.DB.prepare("PRAGMA defer_foreign_keys = on"), ...inserts]);
}
