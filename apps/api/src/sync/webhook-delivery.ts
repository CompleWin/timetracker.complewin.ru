import { and, eq, isNotNull, sql, type SQLWrapper } from "drizzle-orm";
import { database, type Database } from "../db/client.ts";
import { notionConnections, projects, tasks, users } from "../db/schema.ts";
import type { Bindings } from "../env.ts";
import { notionClient, NotionReauthRequired } from "../notion/client.ts";
import { isConnected, type ConnectedRow } from "../notion/connections.ts";
import { listNotionDatabaseRows, type NotionDatabaseRow } from "../notion/databases.ts";
import {
  notionPageJsonSchema,
  pagePath,
  toPageSnapshot,
  type NotionPageSnapshot,
} from "../notion/pages.ts";
import { openProjectBook } from "../notion/record-projects.ts";
import {
  normalizedNotionId,
  sameNotionId,
  type NotionEvent,
  type NotionReference,
} from "../notion/webhook-events.ts";
import { importPages } from "./page-import.ts";
import {
  ensureAccepted,
  isNotFound,
  PageRejected,
  RateLimited,
  sendRequest,
  ServerFailure,
} from "./page-requests.ts";
import { applyLinkedPages, toPulledTask, type PulledTask } from "./pulled-pages.ts";
import { dropDeletedPage, type SyncRun } from "./task-pages.ts";

const MS_PER_SECOND = 1000;
const PAGE_TIMEOUT_MS = 10_000;

type Recipient = {
  connection: ConnectedRow;
  locale: (typeof users.$inferSelect)["locale"];
  timeZone: string | null;
};

type LinkedPage = {
  task: PulledTask;
  databaseId: string | null;
};

export async function deliverNotionEvent(
  env: Bindings,
  event: NotionEvent,
  now: Date,
): Promise<void> {
  const db = database(env);
  for (const recipient of await recipientsOf(db, event)) {
    try {
      await deliverTo(env, db, recipient, event, now);
    } catch (error) {
      if (!isNotionFailure(error)) console.error("Notion webhook event failed:", error);
    }
  }
}

async function recipientsOf(db: Database, event: NotionEvent): Promise<Recipient[]> {
  const rows = await db
    .select({ connection: notionConnections, locale: users.locale, timeZone: users.timezone })
    .from(notionConnections)
    .innerJoin(users, eq(users.id, notionConnections.userId))
    .where(
      and(
        eq(notionConnections.status, "ok"),
        isNotNull(notionConnections.accessTokenEnc),
        matchesNotionId(notionConnections.workspaceId, event.workspace_id),
      ),
    );
  return rows.flatMap(({ connection, locale, timeZone }) =>
    isConnected(connection) && isAccessible(event, connection.botId)
      ? [{ connection, locale, timeZone }]
      : [],
  );
}

function isAccessible(event: NotionEvent, botId: string | null): boolean {
  if (event.accessible_by === undefined || botId === null) return true;
  return event.accessible_by.some((reference) => isBot(reference, botId));
}

function isOwnPush(event: NotionEvent, botId: string | null): boolean {
  const authors = event.authors ?? [];
  return botId !== null && authors.length > 0 && authors.every((author) => isBot(author, botId));
}

function isBot(reference: NotionReference, botId: string): boolean {
  return reference.type === "bot" && sameNotionId(reference.id, botId);
}

function isPaused(connection: ConnectedRow, now: Date): boolean {
  return connection.syncPausedUntil !== null && connection.syncPausedUntil > now;
}

async function deliverTo(
  env: Bindings,
  db: Database,
  { connection, locale, timeZone }: Recipient,
  event: NotionEvent,
  now: Date,
): Promise<void> {
  await db
    .update(notionConnections)
    .set({ webhookEventAt: now })
    .where(eq(notionConnections.id, connection.id));
  if (isOwnPush(event, connection.botId) || isPaused(connection, now)) return;
  const owner = { id: connection.userId, locale, timeZone };
  const databases = await listNotionDatabaseRows(db, owner.id);
  const linked = await linkedPage(db, owner.id, event.entity.id);
  if (linked === undefined && parentDatabase(databases, event) === undefined) return;
  const run: SyncRun = { db, client: notionClient(env, connection), owner, databases, now };
  try {
    const page = await readPage(run, event.entity.id);
    if (linked !== undefined) await applyToLinkedTask(run, linked, page);
    else if (page !== undefined) await importNewPage(run, page);
  } catch (error) {
    if (!(error instanceof RateLimited)) throw error;
    await pauseSync(db, connection.id, now, error.retryAfterSec);
  }
}

function parentDatabase(
  databases: NotionDatabaseRow[],
  event: NotionEvent,
): NotionDatabaseRow | undefined {
  const parentId = event.data?.parent?.id;
  if (parentId === undefined) return undefined;
  return databases.find(
    (row) => sameNotionId(row.databaseId, parentId) || sameNotionId(row.dataSourceId, parentId),
  );
}

async function linkedPage(
  db: Database,
  userId: string,
  pageId: string,
): Promise<LinkedPage | undefined> {
  const [row] = await db
    .select({ task: tasks, projectName: projects.name })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.userId, userId), matchesNotionId(tasks.notionPageId, pageId)))
    .limit(1);
  const task = row && toPulledTask(row.task, row.projectName);
  return row === undefined || task === undefined
    ? undefined
    : { task, databaseId: row.task.notionDatabaseId };
}

function matchesNotionId(column: SQLWrapper, id: string) {
  return sql`lower(replace(${column}, '-', '')) = ${normalizedNotionId(id)}`;
}

async function readPage(run: SyncRun, pageId: string): Promise<NotionPageSnapshot | undefined> {
  const reply = await sendRequest(run.client, {
    method: "GET",
    path: pagePath(pageId),
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (isNotFound(reply)) return undefined;
  ensureAccepted(reply);
  const page = notionPageJsonSchema.safeParse(reply.body);
  if (!page.success) throw new ServerFailure("Notion returned an unexpected page");
  return toPageSnapshot(page.data);
}

async function applyToLinkedTask(
  run: SyncRun,
  linked: LinkedPage,
  page: NotionPageSnapshot | undefined,
): Promise<void> {
  if (page === undefined || page.inTrash) {
    await dropDeletedPage(run, linked.task.id);
    return;
  }
  const target = run.databases.find((row) => row.id === linked.databaseId);
  if (target === undefined || !isInDatabase(page, target)) return;
  const book = await openProjectBook(run.db, run.owner, run.now);
  await applyLinkedPages(run, book, target, new Map([[page.id, linked.task]]), [page]);
}

async function importNewPage(run: SyncRun, page: NotionPageSnapshot): Promise<void> {
  const target = run.databases.find((row) => isInDatabase(page, row));
  if (target === undefined || page.inTrash) return;
  const book = await openProjectBook(run.db, run.owner, run.now);
  await importPages(run, book, target, [page]);
}

function isInDatabase(page: NotionPageSnapshot, target: NotionDatabaseRow): boolean {
  return page.dataSourceId !== null && sameNotionId(page.dataSourceId, target.dataSourceId);
}

async function pauseSync(
  db: Database,
  connectionId: string,
  now: Date,
  retryAfterSec: number,
): Promise<void> {
  const until = new Date(now.getTime() + retryAfterSec * MS_PER_SECOND);
  await db
    .update(notionConnections)
    .set({ syncPausedUntil: until })
    .where(eq(notionConnections.id, connectionId));
}

function isNotionFailure(error: unknown): boolean {
  return (
    error instanceof ServerFailure ||
    error instanceof PageRejected ||
    error instanceof NotionReauthRequired
  );
}
