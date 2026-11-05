import { and, eq, exists, isNotNull, isNull, lte, or } from "drizzle-orm";
import { database, type Database } from "../db/client.ts";
import { notionConnections, notionDatabases, users } from "../db/schema.ts";
import type { Bindings } from "../env.ts";
import { notionClient } from "../notion/client.ts";
import { isConnected, type ConnectedRow } from "../notion/connections.ts";
import { listNotionDatabaseRows } from "../notion/databases.ts";
import { budgetedClient } from "./page-requests.ts";
import { pullUserChanges } from "./pull.ts";
import { pushUserChanges } from "./push.ts";
import type { SyncRun } from "./task-pages.ts";

const MAX_REQUESTS_PER_RUN = 100;
const REQUEST_PAUSE_MS = 350;

type SyncUser = {
  connection: ConnectedRow;
  locale: (typeof users.$inferSelect)["locale"];
  timeZone: string | null;
};

export async function syncNotion(env: Bindings, now: Date): Promise<void> {
  const db = database(env);
  for (const user of await syncUsers(db, now)) await syncUser(env, db, user, now);
}

async function syncUsers(db: Database, now: Date): Promise<SyncUser[]> {
  const rows = await db
    .select({ connection: notionConnections, locale: users.locale, timeZone: users.timezone })
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
  return rows.flatMap(({ connection, locale, timeZone }) =>
    isConnected(connection) ? [{ connection, locale, timeZone }] : [],
  );
}

async function syncUser(
  env: Bindings,
  db: Database,
  { connection, locale, timeZone }: SyncUser,
  now: Date,
): Promise<void> {
  await db
    .update(notionConnections)
    .set({ lastSyncAt: now })
    .where(eq(notionConnections.id, connection.id));
  const budget = { remaining: MAX_REQUESTS_PER_RUN };
  const pauseMs = env.ENV === "test" ? 0 : REQUEST_PAUSE_MS;
  const run: SyncRun = {
    db,
    client: budgetedClient(notionClient(env, connection), budget, pauseMs),
    owner: { id: connection.userId, locale, timeZone },
    databases: await listNotionDatabaseRows(db, connection.userId),
    now,
  };
  if ((await pullUserChanges(run)) === "stop") return;
  await pushUserChanges(run, connection.id);
}
