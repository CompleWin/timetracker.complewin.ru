import { and, eq, exists, inArray, isNotNull, notExists, sql } from "drizzle-orm";
import { idChunks } from "../db/bulk.ts";
import type { Database } from "../db/client.ts";
import { deletedNotionPages, tasks } from "../db/schema.ts";
import { normalizedNotionId } from "./webhook-events.ts";

export function rememberDeletedNotionPage(db: Database, userId: string, taskId: string) {
  const page = db
    .select({
      userId: tasks.userId,
      pageId: sql<string>`lower(replace(${tasks.notionPageId}, '-', ''))`.as("page_id"),
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId), isNotNull(tasks.notionPageId)));
  return db.insert(deletedNotionPages).select(page).onConflictDoNothing();
}

export function forgetDeletedNotionPage(
  db: Database,
  userId: string,
  pageId: string,
  taskId: string,
) {
  const linkedTask = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId), eq(tasks.notionPageId, pageId)));
  return db
    .delete(deletedNotionPages)
    .where(
      and(
        eq(deletedNotionPages.userId, userId),
        eq(deletedNotionPages.pageId, normalizedNotionId(pageId)),
        exists(linkedTask),
      ),
    );
}

export function pageWasNotDeleted(db: Database, userId: string, pageId: string) {
  return notExists(
    db
      .select({ pageId: deletedNotionPages.pageId })
      .from(deletedNotionPages)
      .where(
        and(
          eq(deletedNotionPages.userId, userId),
          eq(deletedNotionPages.pageId, normalizedNotionId(pageId)),
        ),
      ),
  );
}

export async function deletedNotionPageIds(
  db: Database,
  userId: string,
  pageIds: string[],
): Promise<Set<string>> {
  const deleted = new Set<string>();
  for (const ids of idChunks(pageIds.map(normalizedNotionId))) {
    const rows = await db
      .select({ pageId: deletedNotionPages.pageId })
      .from(deletedNotionPages)
      .where(and(eq(deletedNotionPages.userId, userId), inArray(deletedNotionPages.pageId, ids)));
    for (const { pageId } of rows) deleted.add(pageId);
  }
  return deleted;
}
