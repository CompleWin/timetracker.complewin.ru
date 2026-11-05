import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { tasks } from "../db/schema.ts";
import type { SentPage } from "./page-state.ts";

export type PageLink = {
  pageId: string;
  pageUrl: string;
  databaseId: string;
};

const NO_PAGE = {
  notionDatabaseId: null,
  notionPageId: null,
  notionPageUrl: null,
  notionSent: null,
  notionSyncedAt: null,
};

export function unlinkDatabaseTasks(db: Database, databaseId: string) {
  return db.update(tasks).set(NO_PAGE).where(eq(tasks.notionDatabaseId, databaseId));
}

export function unlinkUserTasks(db: Database, userId: string) {
  return db.update(tasks).set(NO_PAGE).where(eq(tasks.userId, userId));
}

export async function unlinkTask(db: Database, taskId: string): Promise<void> {
  await db.update(tasks).set(NO_PAGE).where(eq(tasks.id, taskId));
}

export async function linkTask(
  db: Database,
  taskId: string,
  link: PageLink,
  sent: SentPage,
  now: Date,
): Promise<void> {
  await db
    .update(tasks)
    .set({
      notionDatabaseId: link.databaseId,
      notionPageId: link.pageId,
      notionPageUrl: link.pageUrl,
      notionSent: sent,
      notionSyncedAt: now,
    })
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
