import type { SyncStatus } from "@stt/shared";
import { and, asc, count, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { syncOutbox, tasks } from "../db/schema.ts";
import { notFound } from "../http/errors.ts";
import { requireConnection, type ConnectedRow } from "../notion/connections.ts";
import { countNotionDatabases } from "../notion/databases.ts";
import { failedItems, pendingItems } from "./outbox.ts";

export async function requireSyncConnection(db: Database, userId: string): Promise<ConnectedRow> {
  const connection = await requireConnection(db, userId);
  if ((await countNotionDatabases(db, userId)) === 0) throw notFound();
  return connection;
}

export async function syncStatus(db: Database, connection: ConnectedRow): Promise<SyncStatus> {
  const ofUser = eq(syncOutbox.userId, connection.userId);
  const [pending, failed] = await Promise.all([
    db.select({ total: count() }).from(syncOutbox).where(and(ofUser, pendingItems)),
    db
      .select({
        taskId: syncOutbox.taskId,
        title: tasks.title,
        error: syncOutbox.lastError,
        attempts: syncOutbox.attempts,
      })
      .from(syncOutbox)
      .innerJoin(tasks, eq(tasks.id, syncOutbox.taskId))
      .where(and(ofUser, failedItems))
      .orderBy(asc(syncOutbox.createdAt)),
  ]);
  return {
    pendingTasks: pending[0]?.total ?? 0,
    failed: failed.map((item) => ({ ...item, error: item.error ?? "" })),
    lastRunAt: connection.lastSyncAt?.toISOString() ?? null,
  };
}
