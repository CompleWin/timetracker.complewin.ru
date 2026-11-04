import type { NotionDatabase, NotionProperty } from "@stt/shared";
import { and, count, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { sortByName } from "../db/order.ts";
import { notionDatabases, projects } from "../db/schema.ts";
import { notFound } from "../http/errors.ts";

export type NotionDatabaseRow = typeof notionDatabases.$inferSelect;

export type NewNotionDatabase = Omit<typeof notionDatabases.$inferInsert, "id" | "isDefault"> &
  Pick<NotionDatabaseRow, "timeProperties">;

export type NotionDatabaseChanges = Partial<
  Omit<NotionDatabaseRow, "id" | "userId" | "connectionId" | "createdAt">
>;

type ProjectPropertyColumns = Pick<
  NotionDatabaseRow,
  "projectPropId" | "projectPropName" | "projectPropType"
>;

export async function listNotionDatabaseRows(
  db: Database,
  userId: string,
): Promise<NotionDatabaseRow[]> {
  const rows = await db.select().from(notionDatabases).where(eq(notionDatabases.userId, userId));
  return sortByName(rows, (row) => row.title);
}

export async function listNotionDatabases(db: Database, userId: string): Promise<NotionDatabase[]> {
  return (await listNotionDatabaseRows(db, userId)).map(toNotionDatabase);
}

export async function findDatabaseOfDataSource(
  db: Database,
  userId: string,
  dataSourceId: string,
): Promise<NotionDatabaseRow | undefined> {
  return db.query.notionDatabases.findFirst({
    where: and(eq(notionDatabases.userId, userId), eq(notionDatabases.dataSourceId, dataSourceId)),
  });
}

export async function findNotionDatabase(
  db: Database,
  userId: string,
  id: string,
): Promise<NotionDatabaseRow | undefined> {
  return db.query.notionDatabases.findFirst({
    where: and(eq(notionDatabases.id, id), eq(notionDatabases.userId, userId)),
  });
}

export async function requireNotionDatabase(
  db: Database,
  userId: string,
  id: string,
): Promise<NotionDatabaseRow> {
  const row = await findNotionDatabase(db, userId, id);
  if (row === undefined) throw notFound();
  return row;
}

export async function countNotionDatabases(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notionDatabases)
    .where(eq(notionDatabases.userId, userId));
  return row?.total ?? 0;
}

export async function hasDefaultDatabase(db: Database, userId: string): Promise<boolean> {
  const row = await db.query.notionDatabases.findFirst({
    columns: { id: true },
    where: and(eq(notionDatabases.userId, userId), eq(notionDatabases.isDefault, true)),
  });
  return row !== undefined;
}

export async function insertNotionDatabase(
  db: Database,
  values: NewNotionDatabase,
  isDefault: boolean,
): Promise<NotionDatabaseRow> {
  const insert = db
    .insert(notionDatabases)
    .values({ id: crypto.randomUUID(), ...values, isDefault })
    .returning();
  const [row] = isDefault
    ? (await db.batch([clearDefault(db, values.userId), insert]))[1]
    : await insert;
  if (row === undefined) throw new Error(`Notion database "${values.title}" was not added`);
  return row;
}

export async function updateNotionDatabase(
  db: Database,
  current: NotionDatabaseRow,
  changes: NotionDatabaseChanges,
): Promise<NotionDatabaseRow> {
  const update = db
    .update(notionDatabases)
    .set(changes)
    .where(eq(notionDatabases.id, current.id))
    .returning();
  const [row] =
    changes.isDefault === true
      ? (await db.batch([clearDefault(db, current.userId), update]))[1]
      : await update;
  if (row === undefined) throw new Error(`Notion database ${current.id} was not updated`);
  return row;
}

export async function removeNotionDatabase(db: Database, id: string): Promise<void> {
  await db.batch([
    db.update(projects).set({ notionDatabaseId: null }).where(eq(projects.notionDatabaseId, id)),
    db.delete(notionDatabases).where(eq(notionDatabases.id, id)),
  ]);
}

export async function removeAllNotionDatabases(db: Database, userId: string): Promise<void> {
  await db.batch([
    db.update(projects).set({ notionDatabaseId: null }).where(eq(projects.userId, userId)),
    db.delete(notionDatabases).where(eq(notionDatabases.userId, userId)),
  ]);
}

export function projectPropertyColumns(property: NotionProperty | null): ProjectPropertyColumns {
  return {
    projectPropId: property?.id ?? null,
    projectPropName: property?.name ?? null,
    projectPropType: property?.type ?? null,
  };
}

export function storedProjectProperty(row: NotionDatabaseRow): NotionProperty | null {
  const { projectPropId: id, projectPropName: name, projectPropType: type } = row;
  return id !== null && name !== null && type !== null ? { id, name, type } : null;
}

export function toNotionDatabase(row: NotionDatabaseRow): NotionDatabase {
  return {
    id: row.id,
    dataSourceId: row.dataSourceId,
    databaseId: row.databaseId,
    title: row.title,
    projectMode: row.projectMode,
    projectProperty: storedProjectProperty(row),
    blockPosition: row.blockPosition,
    timeProperties: row.timeProperties,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}

function clearDefault(db: Database, userId: string) {
  return db
    .update(notionDatabases)
    .set({ isDefault: false })
    .where(and(eq(notionDatabases.userId, userId), eq(notionDatabases.isDefault, true)));
}
