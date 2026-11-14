import { and, eq, getTableColumns, inArray, notExists, sql, type Column } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "../db/client.ts";
import { tasks, timeEntries } from "../db/schema.ts";
import type { NewTask, TaskPageLink } from "../tasks/tasks.ts";
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

type LinkedPage = TaskPageLink & { notionPageId: string };

const pageOwner = alias(tasks, "page_owner");

export function attachPage(db: Database, taskId: string, link: LinkedPage, now: Date) {
  return db
    .update(tasks)
    .set({ ...link, updatedAt: now })
    .where(and(eq(tasks.id, taskId), pageIsFree(db, tasks.userId, link.notionPageId)));
}

export function insertPageTask(
  db: Database,
  userId: string,
  task: NewTask,
  link: LinkedPage,
  now: Date,
) {
  const row: typeof tasks.$inferInsert = {
    id: crypto.randomUUID(),
    userId,
    ...task,
    ...link,
    createdAt: now,
    updatedAt: now,
  };
  const values = Object.entries(getTableColumns(tasks)).map(([key, column]) =>
    driverValue(column, row[key as keyof typeof row]),
  );
  return db
    .insert(tasks)
    .select(
      sql`select ${sql.join(values, sql`, `)} where ${pageIsFree(db, sql`${userId}`, link.notionPageId)}`,
    );
}

function driverValue(column: Column, value: unknown) {
  const filled = value ?? column.default ?? null;
  return filled === null ? sql`null` : sql`${column.mapToDriverValue(filled)}`;
}

function pageIsFree(db: Database, userId: Parameters<typeof eq>[0], pageId: string) {
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
