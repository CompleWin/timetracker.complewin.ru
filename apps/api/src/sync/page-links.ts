import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { tasks, timeEntries } from "../db/schema.ts";
import type { TaskPageLink } from "../tasks/tasks.ts";
import type { SentPage } from "./page-state.ts";

const NO_PAGE = {
  notionDatabaseId: null,
  notionPageId: null,
  notionPageUrl: null,
  notionSent: null,
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

export function attachPage(db: Database, taskId: string, link: TaskPageLink, now: Date) {
  return db
    .update(tasks)
    .set({ ...link, updatedAt: now })
    .where(eq(tasks.id, taskId));
}

export async function markSynced(
  db: Database,
  taskId: string,
  sent: SentPage,
  now: Date,
): Promise<void> {
  await db.update(tasks).set({ notionSent: sent, notionSyncedAt: now }).where(eq(tasks.id, taskId));
}
