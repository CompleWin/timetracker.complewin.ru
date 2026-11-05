import type { Locale, NotionPage, NotionPageQuery } from "@stt/shared";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { database, type Database } from "../db/client.ts";
import { tasks } from "../db/schema.ts";
import type { Bindings } from "../env.ts";
import { notFound, notionUnavailable, validationError } from "../http/errors.ts";
import { notionClient, type NotionClient } from "./client.ts";
import { requireUsableConnection, type ConnectedRow } from "./connections.ts";
import {
  countNotionDatabases,
  listNotionDatabaseRows,
  type NotionDatabaseRow,
} from "./databases.ts";
import type { NotionApiRequest } from "./http.ts";
import { requestNotionJson } from "./json-request.ts";
import { dataSourceQueryPath, pageListSchema, pagesOf, taskTitleOf } from "./pages.ts";

const PAGE_SIZE = 20;
const COMPLETE_GROUP = "complete";
const STATUS_TYPE = "status";

const statusSchemaOfSource = z.object({
  properties: z.record(
    z.string(),
    z.object({
      id: z.string(),
      type: z.string(),
      status: z
        .object({
          options: z.array(z.object({ id: z.string(), name: z.string() })),
          groups: z.array(z.object({ name: z.string(), option_ids: z.array(z.string()) })),
        })
        .optional(),
    }),
  ),
});

type PageOwner = { id: string; locale: Locale };

export async function requirePagesConnection(db: Database, userId: string): Promise<ConnectedRow> {
  const connection = await requireUsableConnection(db, userId);
  if ((await countNotionDatabases(db, userId)) === 0) throw notFound();
  return connection;
}

export async function searchNotionPages(
  env: Bindings,
  owner: PageOwner,
  query: NotionPageQuery,
): Promise<NotionPage[]> {
  const db = database(env);
  const connection = await requirePagesConnection(db, owner.id);
  const target = await searchedDatabase(db, owner.id, query.databaseId);
  const client = notionClient(env, connection);
  const statusConditions =
    query.includeCompleted === "true" ? [] : await openStatusConditions(client, target);
  const conditions = [...titleConditions(target, query.q), ...statusConditions];
  const found = await requestNotionJson(client, queryRequest(target, conditions), pageListSchema);
  if (found === undefined) throw notionUnavailable();
  const pages = pagesOf(found.results);
  const linked = await linkedTaskIds(
    db,
    owner.id,
    pages.map((page) => page.id),
  );
  return pages.map((page) => ({
    pageId: page.id,
    title: taskTitleOf(page, target.propertyIds.title, owner.locale),
    url: page.url,
    linkedTaskId: linked.get(page.id) ?? null,
  }));
}

export async function linkedTaskIds(
  db: Database,
  userId: string,
  pageIds: string[],
): Promise<Map<string, string>> {
  if (pageIds.length === 0) return new Map();
  const rows = await db
    .select({ id: tasks.id, pageId: tasks.notionPageId })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.notionPageId, pageIds)));
  return new Map(rows.flatMap(({ id, pageId }) => (pageId === null ? [] : [[pageId, id]])));
}

async function searchedDatabase(
  db: Database,
  userId: string,
  databaseId: string | undefined,
): Promise<NotionDatabaseRow> {
  const databases = await listNotionDatabaseRows(db, userId);
  const found = databases.find((row) =>
    databaseId === undefined ? row.isDefault : row.id === databaseId,
  );
  if (found === undefined) throw validationError({ databaseId: "Expected an added database" });
  return found;
}

function titleConditions(target: NotionDatabaseRow, q: string | undefined): unknown[] {
  const text = q?.trim() ?? "";
  if (text === "") return [];
  return [{ property: target.propertyIds.title, title: { contains: text } }];
}

async function openStatusConditions(
  client: NotionClient,
  target: NotionDatabaseRow,
): Promise<unknown[]> {
  const request: NotionApiRequest = {
    method: "GET",
    path: `/v1/data_sources/${encodeURIComponent(target.dataSourceId)}`,
  };
  const source = await requestNotionJson(client, request, statusSchemaOfSource);
  if (source === undefined) throw notionUnavailable();
  const status = Object.values(source.properties).find(({ type }) => type === STATUS_TYPE);
  if (status?.status === undefined) return [];
  const completeIds = new Set(
    status.status.groups
      .filter((group) => group.name.toLowerCase() === COMPLETE_GROUP)
      .flatMap((group) => group.option_ids),
  );
  return status.status.options
    .filter((option) => completeIds.has(option.id))
    .map((option) => ({ property: status.id, status: { does_not_equal: option.name } }));
}

function queryRequest(target: NotionDatabaseRow, conditions: unknown[]): NotionApiRequest {
  return {
    method: "POST",
    path: dataSourceQueryPath(target.dataSourceId),
    body: {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: PAGE_SIZE,
      ...(conditions.length > 0 && { filter: { and: conditions } }),
    },
  };
}
