import {
  and,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { idChunks } from "../db/bulk.ts";
import {
  notionConnections,
  notionDatabases,
  projects,
  syncOutbox,
  tasks,
  timeEntries,
} from "../db/schema.ts";

export const FAILED_ATTEMPTS = 10;

export const pendingItems = lt(syncOutbox.attempts, FAILED_ATTEMPTS);

export const failedItems = gte(syncOutbox.attempts, FAILED_ATTEMPTS);

type QueueMode = "event" | "keep";

export function enqueueTasks(
  db: Database,
  userId: string,
  taskIds: string[],
  now: Date,
): Promise<string[]> {
  if (taskIds.length === 0) return Promise.resolve([]);
  return enqueueWhere(db, userId, inArray(tasks.id, taskIds), now, "event");
}

export function enqueueProjectTasks(
  db: Database,
  userId: string,
  projectId: string,
  now: Date,
): Promise<string[]> {
  const pushable = or(isNull(tasks.notionPageId), isNotNull(tasks.notionSyncedAt));
  return enqueueWhere(db, userId, and(eq(tasks.projectId, projectId), pushable), now, "event");
}

export async function enqueueTasksWithSessions(
  db: Database,
  userId: string,
  taskIds: string[],
  now: Date,
): Promise<void> {
  for (const ids of idChunks(taskIds)) {
    await enqueueWhere(db, userId, and(inArray(tasks.id, ids), hasSessions(db)), now, "event");
  }
}

export function enqueueBlockInheritingTasks(
  db: Database,
  userId: string,
  databaseId: string,
  now: Date,
): Promise<string[]> {
  const inheriting = and(
    eq(tasks.notionDatabaseId, databaseId),
    isNotNull(tasks.notionPageId),
    isNotNull(tasks.notionSyncedAt),
    isNull(tasks.notionBlockPosition),
  );
  return enqueueWhere(db, userId, inheriting, now, "event");
}

export function enqueueUnlinkedActiveTasks(
  db: Database,
  userId: string,
  now: Date,
): Promise<string[]> {
  const unlinkedActive = and(
    isNull(tasks.notionPageId),
    isNull(tasks.archivedAt),
    isNull(projects.archivedAt),
  );
  return enqueueWhere(db, userId, unlinkedActive, now, "event");
}

export function enqueueStaleTasks(
  db: Database,
  userId: string,
  condition: SQL | undefined,
  now: Date,
): Promise<string[]> {
  return enqueueWhere(db, userId, condition, now, "keep");
}

export function removeQueuedTasksOfDatabase(db: Database, databaseId: string) {
  const databaseTasks = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.notionDatabaseId, databaseId));
  return db.delete(syncOutbox).where(inArray(syncOutbox.taskId, databaseTasks));
}

export function clearQueue(db: Database, userId: string) {
  return db.delete(syncOutbox).where(eq(syncOutbox.userId, userId));
}

export async function retryFailed(db: Database, userId: string, now: Date): Promise<void> {
  await db
    .update(syncOutbox)
    .set({ attempts: 0, nextTryAt: now, lastError: null })
    .where(and(eq(syncOutbox.userId, userId), failedItems));
}

async function enqueueWhere(
  db: Database,
  userId: string,
  condition: SQL | undefined,
  now: Date,
  mode: QueueMode,
): Promise<string[]> {
  const candidates = db
    .select({
      taskId: tasks.id,
      userId: tasks.userId,
      attempts: sql<number>`0`.as("attempts"),
      nextTryAt: sql<number>`${now.getTime()}`.as("next_try_at"),
      lastError: sql<null>`null`.as("last_error"),
      createdAt: sql<number>`${now.getTime()}`.as("created_at"),
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.userId, userId), condition, hasConnection(db), hasTargetDatabase(db)));
  const insert = db.insert(syncOutbox).select(candidates);
  const queued =
    mode === "event"
      ? insert.onConflictDoUpdate({ target: syncOutbox.taskId, set: freshEvent(now) })
      : insert.onConflictDoNothing();
  const rows = await queued.returning({ taskId: syncOutbox.taskId });
  return rows.map(({ taskId }) => taskId);
}

function freshEvent(now: Date) {
  return {
    attempts: 0,
    lastError: null,
    nextTryAt: sql`case when ${syncOutbox.attempts} >= ${FAILED_ATTEMPTS} then ${now.getTime()} else ${syncOutbox.nextTryAt} end`,
  };
}

function hasSessions(db: Database): SQL {
  return exists(
    db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.taskId, tasks.id), isNull(timeEntries.deletedAt))),
  );
}

function hasConnection(db: Database): SQL {
  return exists(
    db
      .select({ id: notionConnections.id })
      .from(notionConnections)
      .where(
        and(
          eq(notionConnections.userId, tasks.userId),
          isNotNull(notionConnections.accessTokenEnc),
        ),
      ),
  );
}

function hasTargetDatabase(db: Database): SQL | undefined {
  const defaultDatabase = exists(
    db
      .select({ id: notionDatabases.id })
      .from(notionDatabases)
      .where(and(eq(notionDatabases.userId, tasks.userId), eq(notionDatabases.isDefault, true))),
  );
  return or(
    isNotNull(tasks.notionDatabaseId),
    isNotNull(projects.notionDatabaseId),
    defaultDatabase,
  );
}
