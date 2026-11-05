import { and, asc, eq, exists, isNotNull, isNull, lte, or } from "drizzle-orm";
import { database, type Database } from "../db/client.ts";
import {
  notionConnections,
  notionDatabases,
  syncOutbox,
  tasks,
  timeEntries,
  users,
} from "../db/schema.ts";
import type { Bindings } from "../env.ts";
import { ApiError } from "../http/errors.ts";
import { notionClient, NotionReauthRequired } from "../notion/client.ts";
import { isConnected, type ConnectedRow } from "../notion/connections.ts";
import { listNotionDatabaseRows } from "../notion/databases.ts";
import { enqueueStaleTasks, FAILED_ATTEMPTS, pendingItems } from "./outbox.ts";
import {
  BudgetExhausted,
  budgetedClient,
  PageRejected,
  RateLimited,
  ServerFailure,
} from "./page-requests.ts";
import { pushTask, type PushRun } from "./task-pages.ts";

const MAX_REQUESTS_PER_RUN = 100;
const REQUEST_PAUSE_MS = 350;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const RUNNING_RESYNC_MS = 10 * MS_PER_MINUTE;
const MAX_BACKOFF_MINUTES = 60;

type SyncUser = {
  connection: ConnectedRow;
  locale: (typeof users.$inferSelect)["locale"];
};

type QueueItem = {
  taskId: string;
  attempts: number;
};

type ItemOutcome = "next" | "stop";

export async function pushNotionChanges(env: Bindings, now: Date): Promise<void> {
  const db = database(env);
  for (const user of await syncUsers(db, now)) await pushUserChanges(env, db, user, now);
}

async function syncUsers(db: Database, now: Date): Promise<SyncUser[]> {
  const rows = await db
    .select({ connection: notionConnections, locale: users.locale })
    .from(notionConnections)
    .innerJoin(users, eq(users.id, notionConnections.userId))
    .where(
      and(
        eq(notionConnections.status, "ok"),
        isNotNull(notionConnections.accessTokenEnc),
        or(isNull(notionConnections.syncPausedUntil), lte(notionConnections.syncPausedUntil, now)),
        exists(
          db
            .select({ id: notionDatabases.id })
            .from(notionDatabases)
            .where(eq(notionDatabases.userId, notionConnections.userId)),
        ),
      ),
    );
  return rows.flatMap(({ connection, locale }) =>
    isConnected(connection) ? [{ connection, locale }] : [],
  );
}

async function pushUserChanges(
  env: Bindings,
  db: Database,
  { connection, locale }: SyncUser,
  now: Date,
): Promise<void> {
  const userId = connection.userId;
  await queueRunningTasks(db, userId, now);
  await db
    .update(notionConnections)
    .set({ lastSyncAt: now })
    .where(eq(notionConnections.id, connection.id));
  const budget = { remaining: MAX_REQUESTS_PER_RUN };
  const pauseMs = env.ENV === "test" ? 0 : REQUEST_PAUSE_MS;
  const run: PushRun = {
    db,
    client: budgetedClient(notionClient(env, connection), budget, pauseMs),
    owner: { id: userId, locale },
    databases: await listNotionDatabaseRows(db, userId),
    now,
  };
  for (const item of await dueItems(db, userId, now)) {
    const outcome = await pushQueuedTask(run, connection.id, item);
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
    .limit(MAX_REQUESTS_PER_RUN);
}

async function pushQueuedTask(
  run: PushRun,
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
  run: PushRun,
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
  run: PushRun,
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

async function backOff(run: PushRun, item: QueueItem, lastError: string): Promise<void> {
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
