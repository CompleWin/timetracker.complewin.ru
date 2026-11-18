import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNull,
  notExists,
  sql,
  type Column,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "../db/client.ts";
import { tasks, timeEntries } from "../db/schema.ts";
import { alreadyLinked, notFound } from "../http/errors.ts";
import { forgetDeletedNotionPage, pageWasNotDeleted } from "../notion/deleted-pages.ts";
import type { SentPage } from "./page-state.ts";

const NO_PAGE = {
  notionDatabaseId: null,
  notionPageId: null,
  notionPageUrl: null,
  notionSent: null,
  notionDefaultProject: false,
  notionSyncedAt: null,
  notionBlock: null,
};

const NO_LINE = { notionBlockId: null, notionLine: null };

export function forgetDatabaseLines(db: Database, databaseId: string) {
  const databaseTasks = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.notionDatabaseId, databaseId));
  return db.update(timeEntries).set(NO_LINE).where(inArray(timeEntries.taskId, databaseTasks));
}

export function forgetUserLines(db: Database, userId: string) {
  return db.update(timeEntries).set(NO_LINE).where(eq(timeEntries.userId, userId));
}

export function forgetTaskLines(db: Database, taskId: string) {
  return db.update(timeEntries).set(NO_LINE).where(eq(timeEntries.taskId, taskId));
}

export function unlinkDatabaseTasks(db: Database, databaseId: string) {
  return db.update(tasks).set(NO_PAGE).where(eq(tasks.notionDatabaseId, databaseId));
}

export function unlinkUserTasks(db: Database, userId: string) {
  return db.update(tasks).set(NO_PAGE).where(eq(tasks.userId, userId));
}

export async function unlinkTask(db: Database, taskId: string): Promise<void> {
  await db.batch([
    forgetTaskLines(db, taskId),
    db.update(tasks).set(NO_PAGE).where(eq(tasks.id, taskId)),
  ]);
}

type TaskRow = typeof tasks.$inferSelect;

export type TaskPageLink = Pick<
  TaskRow,
  "notionDatabaseId" | "notionPageUrl" | "notionSent" | "notionDefaultProject"
> & { notionPageId: string };

type PageTaskInsert = typeof tasks.$inferInsert & TaskPageLink;

const pageOwner = alias(tasks, "page_owner");

export async function createPageTask(db: Database, values: PageTaskInsert): Promise<TaskRow> {
  const { userId, notionPageId, id } = values;
  const [created] = await db.batch([
    insertPageTask(db, values, "manual").returning(),
    forgetDeletedNotionPage(db, userId, notionPageId, id),
  ]);
  const [row] = created;
  if (row !== undefined) return row;
  const existing = await db.query.tasks.findFirst({
    columns: { id: true },
    where: and(eq(tasks.userId, userId), eq(tasks.notionPageId, notionPageId)),
  });
  if (existing === undefined) throw notFound();
  throw alreadyLinked(existing.id);
}

export function attachPage(
  db: Database,
  userId: string,
  taskId: string,
  link: TaskPageLink,
  now: Date,
) {
  return db
    .update(tasks)
    .set({ ...link, updatedAt: now })
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.id, taskId),
        isNull(tasks.notionPageId),
        pageIsFree(db, userId, link.notionPageId),
        pageWasNotDeleted(db, userId, link.notionPageId),
      ),
    );
}

export function insertPageTask(db: Database, row: PageTaskInsert, mode: "automatic" | "manual") {
  const { userId, notionPageId: pageId } = row;
  const values = Object.entries(getTableColumns(tasks)).map(([key, column]) =>
    driverValue(column, row[key as keyof typeof row]),
  );
  const allowed = and(
    pageIsFree(db, userId, pageId),
    mode === "automatic" ? pageWasNotDeleted(db, userId, pageId) : undefined,
  );
  return db.insert(tasks).select(sql`select ${sql.join(values, sql`, `)} where ${allowed}`);
}

function driverValue(column: Column, value: unknown) {
  const filled = value ?? column.default ?? null;
  return filled === null ? sql`null` : sql`${column.mapToDriverValue(filled)}`;
}

function pageIsFree(db: Database, userId: string, pageId: string) {
  return notExists(
    db
      .select({ id: pageOwner.id })
      .from(pageOwner)
      .where(and(eq(pageOwner.userId, userId), eq(pageOwner.notionPageId, pageId))),
  );
}

export async function markSynced(
  db: Database,
  taskId: string,
  sent: SentPage,
  now: Date,
): Promise<void> {
  await db.update(tasks).set({ notionSent: sent, notionSyncedAt: now }).where(eq(tasks.id, taskId));
}
