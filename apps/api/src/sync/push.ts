import { and, asc, eq, exists, isNull, lte, or } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { notionConnections, syncOutbox, tasks, timeEntries } from "../db/schema.ts";
import { ApiError } from "../http/errors.ts";
import { NotionReauthRequired } from "../notion/client.ts";
import { enqueueStaleTasks, FAILED_ATTEMPTS, pendingItems } from "./outbox.ts";
import { BudgetExhausted, PageRejected, RateLimited, ServerFailure } from "./page-requests.ts";
import { pushTask, type SyncRun } from "./task-pages.ts";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const RUNNING_RESYNC_MS = 10 * MS_PER_MINUTE;
const MAX_BACKOFF_MINUTES = 60;
const MAX_ITEMS_PER_RUN = 100;

type QueueItem = {
  taskId: string;
  attempts: number;
};

type ItemOutcome = "next" | "stop";

export async function pushUserChanges(run: SyncRun, connectionId: string): Promise<void> {
  await queueRunningTasks(run.db, run.owner.id, run.now);
  for (const item of await dueItems(run.db, run.owner.id, run.now)) {
    const outcome = await pushQueuedTask(run, connectionId, item);
    if (outcome === "stop") break;
  }
}

async function queueRunningTasks(db: Database, userId: string, now: Date): Promise<void> {
  const running = exists(
    db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.taskId, tasks.id),
          isNull(timeEntries.endedAt),
          isNull(timeEntries.deletedAt),
        ),
      ),
  );
  const syncedLongAgo = or(
    isNull(tasks.notionSyncedAt),
    lte(tasks.notionSyncedAt, new Date(now.getTime() - RUNNING_RESYNC_MS)),
  );
  await enqueueStaleTasks(db, userId, and(running, syncedLongAgo), now);
}

function dueItems(db: Database, userId: string, now: Date): Promise<QueueItem[]> {
  return db
    .select({ taskId: syncOutbox.taskId, attempts: syncOutbox.attempts })
    .from(syncOutbox)
    .where(and(eq(syncOutbox.userId, userId), pendingItems, lte(syncOutbox.nextTryAt, now)))
    .orderBy(asc(syncOutbox.nextTryAt), asc(syncOutbox.createdAt))
    .limit(MAX_ITEMS_PER_RUN);
}

async function pushQueuedTask(
  run: SyncRun,
  connectionId: string,
  item: QueueItem,
): Promise<ItemOutcome> {
  try {
    await pushTask(run, item.taskId);
    await run.db.delete(syncOutbox).where(eq(syncOutbox.taskId, item.taskId));
    return "next";
  } catch (error) {
    return handleFailure(run, connectionId, item, error);
  }
}

async function handleFailure(
  run: SyncRun,
  connectionId: string,
  item: QueueItem,
  error: unknown,
): Promise<ItemOutcome> {
  if (error instanceof RateLimited) {
    await postpone(run, connectionId, item, error.retryAfterSec);
    return "stop";
  }
  if (error instanceof BudgetExhausted || isReauthRequired(error)) return "stop";
  if (error instanceof PageRejected || isRejectedByApi(error)) {
    await markFailed(run.db, item, errorText(error));
    return "next";
  }
  if (!(error instanceof ServerFailure || error instanceof ApiError)) {
    console.error("Notion sync of task failed:", error);
  }
  await backOff(run, item, errorText(error));
  return "next";
}

function isReauthRequired(error: unknown): boolean {
  return (
    error instanceof NotionReauthRequired ||
    (error instanceof ApiError && error.code === "notion_reauth_required")
  );
}

function isRejectedByApi(error: unknown): boolean {
  return error instanceof ApiError && error.code !== "notion_unavailable";
}

async function postpone(
  run: SyncRun,
  connectionId: string,
  item: QueueItem,
  retryAfterSec: number,
): Promise<void> {
  const until = new Date(run.now.getTime() + retryAfterSec * MS_PER_SECOND);
  await run.db.batch([
    run.db.update(syncOutbox).set({ nextTryAt: until }).where(eq(syncOutbox.taskId, item.taskId)),
    run.db
      .update(notionConnections)
      .set({ syncPausedUntil: until })
      .where(eq(notionConnections.id, connectionId)),
  ]);
}

async function backOff(run: SyncRun, item: QueueItem, lastError: string): Promise<void> {
  const attempts = item.attempts + 1;
  const delayMinutes = Math.min(2 ** (attempts - 1), MAX_BACKOFF_MINUTES);
  const nextTryAt = new Date(run.now.getTime() + delayMinutes * MS_PER_MINUTE);
  await run.db
    .update(syncOutbox)
    .set({ attempts, nextTryAt, lastError })
    .where(eq(syncOutbox.taskId, item.taskId));
}

async function markFailed(db: Database, item: QueueItem, lastError: string): Promise<void> {
  await db
    .update(syncOutbox)
    .set({ attempts: FAILED_ATTEMPTS, lastError })
    .where(eq(syncOutbox.taskId, item.taskId));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
