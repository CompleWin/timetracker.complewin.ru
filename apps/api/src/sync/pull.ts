import { eq } from "drizzle-orm";
import { notionDatabases } from "../db/schema.ts";
import { NotionReauthRequired } from "../notion/client.ts";
import {
  completeStatusIds,
  dataSourceRequest,
  parseDataSource,
  statusFieldOf,
} from "../notion/data-sources.ts";
import {
  statusFilterColumns,
  updateNotionDatabase,
  type NotionDatabaseRow,
} from "../notion/databases.ts";
import type { NotionApiRequest } from "../notion/http.ts";
import {
  dataSourceQueryPath,
  pageListSchema,
  pagesOf,
  type NotionPageSnapshot,
} from "../notion/pages.ts";
import { openProjectBook } from "../notion/record-projects.ts";
import { importPages } from "./page-import.ts";
import {
  BudgetExhausted,
  ensureAccepted,
  isBadRequest,
  PageRejected,
  RateLimited,
  sendRequest,
  ServerFailure,
} from "./page-requests.ts";
import { applyLinkedPages, linkedTasks } from "./pulled-pages.ts";
import type { SyncRun } from "./task-pages.ts";

const MS_PER_MINUTE = 60_000;
const PULL_INTERVAL_MS = 5 * MS_PER_MINUTE;
const CURSOR_OVERLAP_MS = 2 * MS_PER_MINUTE;
const PULL_PAGE_SIZE = 100;
const MAX_PULL_PAGES = 5;

export type PullOutcome = "next" | "stop";

type QueryPage = {
  pages: NotionPageSnapshot[];
  nextCursor: string | undefined;
};

export async function pullUserChanges(run: SyncRun): Promise<PullOutcome> {
  for (const target of run.databases.filter((database) => isDue(database, run.now))) {
    try {
      if (await pullDatabase(run, target)) return "next";
    } catch (error) {
      if (stopsUser(error)) return "stop";
      if (!(error instanceof ServerFailure || error instanceof PageRejected)) {
        console.error("Notion pull of database failed:", error);
      }
    }
  }
  return "next";
}

function isDue(database: NotionDatabaseRow, now: Date): boolean {
  return (
    database.pulledAt === null ||
    database.pullNextCursor !== null ||
    now.getTime() - database.pulledAt.getTime() >= PULL_INTERVAL_MS
  );
}

function stopsUser(error: unknown): boolean {
  return (
    error instanceof RateLimited ||
    error instanceof BudgetExhausted ||
    error instanceof NotionReauthRequired
  );
}

async function pullDatabase(run: SyncRun, stored: NotionDatabaseRow): Promise<boolean> {
  const target = await withStatusFilter(run, stored);
  let startCursor = target.pullNextCursor ?? undefined;
  let latestEdit = target.pullLatestEdit ?? undefined;
  for (let read = 0; read < MAX_PULL_PAGES; read += 1) {
    const result = await queryPage(run, target, startCursor);
    if (result === undefined) {
      startCursor = undefined;
      latestEdit = undefined;
      await saveProgress(run, target, undefined, undefined);
      continue;
    }
    const created = await applyPages(run, target, result.pages);
    latestEdit = latestEditOf(result.pages, latestEdit);
    startCursor = result.nextCursor;
    if (startCursor === undefined) {
      await finishPass(run, target, latestEdit);
      return created;
    }
    await saveProgress(run, target, startCursor, latestEdit);
    if (created) return true;
  }
  return false;
}

async function withStatusFilter(
  run: SyncRun,
  target: NotionDatabaseRow,
): Promise<NotionDatabaseRow> {
  if (target.skippedStatusIds !== null) return target;
  const reply = await sendRequest(run.client, dataSourceRequest(target.dataSourceId));
  ensureAccepted(reply);
  const source = parseDataSource(reply.body);
  if (source === undefined) throw new ServerFailure("Notion returned an unexpected data source");
  const field = statusFieldOf(source);
  return updateNotionDatabase(run.db, target, statusFilterColumns(field, completeStatusIds(field)));
}

async function queryPage(
  run: SyncRun,
  target: NotionDatabaseRow,
  startCursor: string | undefined,
): Promise<QueryPage | undefined> {
  const reply = await sendRequest(run.client, queryRequest(target, startCursor));
  if (startCursor !== undefined && isBadRequest(reply)) return undefined;
  ensureAccepted(reply);
  const list = pageListSchema.safeParse(reply.body);
  if (!list.success) throw new ServerFailure("Notion returned an unexpected page list");
  const nextCursor = list.data.has_more === true ? (list.data.next_cursor ?? undefined) : undefined;
  return { pages: pagesOf(list.data.results), nextCursor };
}

function queryRequest(
  target: NotionDatabaseRow,
  startCursor: string | undefined,
): NotionApiRequest {
  return {
    method: "POST",
    path: dataSourceQueryPath(target.dataSourceId),
    body: {
      ...(target.pullCursor !== null && { filter: editedSince(target.pullCursor) }),
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: PULL_PAGE_SIZE,
      ...(startCursor !== undefined && { start_cursor: startCursor }),
    },
  };
}

function editedSince(cursor: Date) {
  return { timestamp: "last_edited_time", last_edited_time: { on_or_after: cursor.toISOString() } };
}

async function applyPages(
  run: SyncRun,
  target: NotionDatabaseRow,
  pages: NotionPageSnapshot[],
): Promise<boolean> {
  if (pages.length === 0) return false;
  const book = await openProjectBook(run.db, run.owner, run.now);
  const linked = await linkedTasks(run, pages);
  await applyLinkedPages(run, book, target, linked, pages);
  const unlinked = pages.filter((page) => !linked.has(page.id));
  return importPages(run, book, target, unlinked);
}

function latestEditOf(pages: NotionPageSnapshot[], seen: Date | undefined): Date | undefined {
  return pages.reduce<Date | undefined>(
    (latest, { lastEditedAt }) =>
      latest === undefined || lastEditedAt > latest ? lastEditedAt : latest,
    seen,
  );
}

async function saveProgress(
  run: SyncRun,
  target: NotionDatabaseRow,
  nextCursor: string | undefined,
  latestEdit: Date | undefined,
): Promise<void> {
  await run.db
    .update(notionDatabases)
    .set({ pullNextCursor: nextCursor ?? null, pullLatestEdit: latestEdit ?? null })
    .where(eq(notionDatabases.id, target.id));
}

async function finishPass(
  run: SyncRun,
  target: NotionDatabaseRow,
  latestEdit: Date | undefined,
): Promise<void> {
  await run.db
    .update(notionDatabases)
    .set({
      pullCursor: nextPullCursor(run, target, latestEdit),
      pullNextCursor: null,
      pullLatestEdit: null,
      pulledAt: run.now,
    })
    .where(eq(notionDatabases.id, target.id));
}

function nextPullCursor(
  run: SyncRun,
  target: NotionDatabaseRow,
  latestEdit: Date | undefined,
): Date {
  if (latestEdit !== undefined) return new Date(latestEdit.getTime() - CURSOR_OVERLAP_MS);
  return target.pullCursor ?? new Date(run.now.getTime() - CURSOR_OVERLAP_MS);
}
