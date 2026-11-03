import { notionProjectPropertyTypes, type NotionProperty } from "@stt/shared";
import { z } from "zod";
import { notionUnavailable } from "../http/errors.ts";
import type { NotionClient } from "./client.ts";
import type { NotionApiRequest } from "./http.ts";
import { requestNotionJson } from "./json-request.ts";
import type { MissingProperty, SchemaProperty } from "./tracker-properties.ts";

const MAX_SEARCH_PAGES = 5;
const SEARCH_PAGE_SIZE = 100;
const EMOJI_ICON = "emoji";
const TITLE_TYPE = "title";

const richTextSchema = z.array(z.object({ plain_text: z.string() }));

const dataSourceSchema = z.object({
  id: z.string(),
  title: richTextSchema,
  icon: z.object({ type: z.string(), emoji: z.string().optional() }).nullish(),
  parent: z.object({ database_id: z.string() }),
  properties: z.record(
    z.string(),
    z.object({ id: z.string(), name: z.string(), type: z.string() }),
  ),
});

const databaseSchema = z.object({ title: richTextSchema });

const searchSchema = z.object({
  results: z.array(dataSourceSchema),
  next_cursor: z.string().nullish(),
});

export type DataSource = {
  id: string;
  databaseId: string;
  title: string;
  icon: string | null;
  properties: SchemaProperty[];
};

export async function searchDataSources(client: NotionClient): Promise<DataSource[]> {
  const found: DataSource[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
    const result = await requestNotionJson(client, searchRequest(cursor), searchSchema);
    if (result === undefined) throw notionUnavailable();
    found.push(...result.results.map(toDataSource));
    cursor = result.next_cursor ?? undefined;
    if (cursor === undefined) break;
  }
  return Promise.all(found.map((source) => withDatabaseTitle(client, source)));
}

export async function withDatabaseTitle(
  client: NotionClient,
  source: DataSource,
): Promise<DataSource> {
  if (source.title !== "") return source;
  const request: NotionApiRequest = {
    method: "GET",
    path: `/v1/databases/${encodeURIComponent(source.databaseId)}`,
  };
  const found = await requestNotionJson(client, request, databaseSchema);
  return found === undefined ? source : { ...source, title: plainText(found.title) };
}

export async function retrieveDataSource(
  client: NotionClient,
  id: string,
): Promise<DataSource | undefined> {
  const request: NotionApiRequest = { method: "GET", path: dataSourcePath(id) };
  const found = await requestNotionJson(client, request, dataSourceSchema);
  return found === undefined ? undefined : toDataSource(found);
}

export async function addDataSourceProperties(
  client: NotionClient,
  id: string,
  added: MissingProperty[],
): Promise<DataSource | undefined> {
  const properties = Object.fromEntries(added.map(({ name, type }) => [name, { [type]: {} }]));
  const request: NotionApiRequest = {
    method: "PATCH",
    path: dataSourcePath(id),
    body: { properties },
  };
  const updated = await requestNotionJson(client, request, dataSourceSchema);
  return updated === undefined ? undefined : toDataSource(updated);
}

export function projectPropertiesOf(source: DataSource): NotionProperty[] {
  return source.properties.flatMap(({ id, name, type }) => {
    const projectType = notionProjectPropertyTypes.find((candidate) => candidate === type);
    return projectType === undefined ? [] : [{ id, name, type: projectType }];
  });
}

export function titlePropertyId(source: DataSource): string {
  const title = source.properties.find((property) => property.type === TITLE_TYPE);
  if (title === undefined) throw notionUnavailable();
  return title.id;
}

function searchRequest(cursor: string | undefined): NotionApiRequest {
  return {
    method: "POST",
    path: "/v1/search",
    body: {
      filter: { property: "object", value: "data_source" },
      page_size: SEARCH_PAGE_SIZE,
      ...(cursor !== undefined && { start_cursor: cursor }),
    },
  };
}

function dataSourcePath(id: string): string {
  return `/v1/data_sources/${encodeURIComponent(id)}`;
}

function toDataSource(source: z.infer<typeof dataSourceSchema>): DataSource {
  return {
    id: source.id,
    databaseId: source.parent.database_id,
    title: plainText(source.title),
    icon: source.icon?.type === EMOJI_ICON ? (source.icon.emoji ?? null) : null,
    properties: Object.values(source.properties),
  };
}

function plainText(parts: z.infer<typeof richTextSchema>): string {
  return parts.map((part) => part.plain_text).join("");
}
