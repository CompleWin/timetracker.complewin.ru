import type { AvailableNotionDatabase, NotionProperty } from "@stt/shared";
import { database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { notFound } from "../http/errors.ts";
import { notionClient } from "./client.ts";
import { requireUsableConnection } from "./connections.ts";
import { projectPropertiesOf, retrieveDataSource, searchDataSources } from "./data-sources.ts";
import { listNotionDatabaseRows } from "./databases.ts";

export async function listAvailableDatabases(
  env: Bindings,
  userId: string,
): Promise<AvailableNotionDatabase[]> {
  const db = database(env);
  const connection = await requireUsableConnection(db, userId);
  const [sources, added] = await Promise.all([
    searchDataSources(notionClient(env, connection)),
    listNotionDatabaseRows(db, userId),
  ]);
  const addedIds = new Map(added.map((row) => [row.dataSourceId, row.id]));
  return sources.map((source) => ({
    dataSourceId: source.id,
    databaseId: source.databaseId,
    title: source.title,
    icon: source.icon,
    addedId: addedIds.get(source.id) ?? null,
  }));
}

export async function listProjectProperties(
  env: Bindings,
  userId: string,
  dataSourceId: string,
): Promise<NotionProperty[]> {
  const connection = await requireUsableConnection(database(env), userId);
  const source = await retrieveDataSource(notionClient(env, connection), dataSourceId);
  if (source === undefined) throw notFound();
  return projectPropertiesOf(source);
}
