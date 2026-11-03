import {
  MAX_NOTION_DATABASES,
  type AddNotionDatabaseBody,
  type NotionDatabase,
  type NotionProperty,
  type UpdateNotionDatabaseBody,
  type User,
} from "@stt/shared";
import { database, type Database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { databaseAlreadyAdded, tooManyDatabases, validationError } from "../http/errors.ts";
import { notionClient, type NotionClient } from "./client.ts";
import { requireUsableConnection, type ConnectedRow } from "./connections.ts";
import {
  addDataSourceProperties,
  projectPropertiesOf,
  retrieveDataSource,
  titlePropertyId,
  type DataSource,
} from "./data-sources.ts";
import {
  countNotionDatabases,
  findDatabaseOfDataSource,
  hasDefaultDatabase,
  insertNotionDatabase,
  projectPropertyColumns,
  removeNotionDatabase,
  requireNotionDatabase,
  storedProjectProperty,
  toNotionDatabase,
  updateNotionDatabase,
  type NotionDatabaseChanges,
  type NotionDatabaseRow,
} from "./databases.ts";
import {
  addedPropertyIds,
  matchTrackerProperties,
  trackerPropertiesFor,
  type TrackerProperty,
  type TrackerPropertyIds,
} from "./tracker-properties.ts";

export type DatabaseOwner = Pick<User, "id" | "locale">;

export type DatabaseSetup = {
  db: Database;
  client: NotionClient;
  connectionId: string;
  owner: DatabaseOwner;
  now: Date;
};

const dataSourceNotFound = () => validationError({ dataSourceId: "Notion data source not found" });

type ProjectSetup = Pick<
  NotionDatabaseChanges,
  "projectMode" | "projectPropId" | "projectPropName" | "projectPropType" | "propertyIds"
>;

export function databaseSetup(
  env: Bindings,
  connection: ConnectedRow,
  owner: DatabaseOwner,
  now: Date,
): DatabaseSetup {
  return {
    db: database(env),
    client: notionClient(env, connection),
    connectionId: connection.id,
    owner,
    now,
  };
}

export async function addNotionDatabase(
  env: Bindings,
  owner: DatabaseOwner,
  settings: AddNotionDatabaseBody,
  now: Date,
): Promise<NotionDatabase> {
  const connection = await requireUsableConnection(database(env), owner.id);
  const row = await addDatabase(databaseSetup(env, connection, owner, now), settings);
  return toNotionDatabase(row);
}

export async function addDatabase(
  { db, client, connectionId, owner, now }: DatabaseSetup,
  settings: AddNotionDatabaseBody,
): Promise<NotionDatabaseRow> {
  const added = await findDatabaseOfDataSource(db, owner.id, settings.dataSourceId);
  if (added !== undefined) throw databaseAlreadyAdded(added.id);
  if ((await countNotionDatabases(db, owner.id)) >= MAX_NOTION_DATABASES) throw tooManyDatabases();
  const source = await requireDataSource(client, settings.dataSourceId);
  const projectProperty =
    settings.projectMode === "property"
      ? projectPropertyOf(source, settings.projectPropertyId)
      : null;
  const wanted = trackerPropertiesFor(settings.projectMode);
  const propertyIds = await ensureTrackerProperties(client, source, wanted, owner);
  const isDefault = settings.isDefault === true || !(await hasDefaultDatabase(db, owner.id));
  const values = {
    userId: owner.id,
    connectionId,
    databaseId: source.databaseId,
    dataSourceId: source.id,
    title: source.title,
    propertyIds: { title: titlePropertyId(source), ...propertyIds },
    projectMode: settings.projectMode,
    ...projectPropertyColumns(projectProperty),
    blockPosition: settings.blockPosition,
    createdAt: now,
  };
  return insertNotionDatabase(db, values, isDefault);
}

export async function changeNotionDatabase(
  env: Bindings,
  owner: DatabaseOwner,
  id: string,
  changes: UpdateNotionDatabaseBody,
): Promise<NotionDatabase> {
  const db = database(env);
  const connection = await requireUsableConnection(db, owner.id);
  const current = await requireNotionDatabase(db, owner.id, id);
  const client = notionClient(env, connection);
  const updated = await updateNotionDatabase(db, current, {
    ...(await changedProjectSetup(client, owner, current, changes)),
    blockPosition: changes.blockPosition,
    isDefault: changes.isDefault,
  });
  return toNotionDatabase(updated);
}

export async function removeNotionDatabaseOf(
  env: Bindings,
  userId: string,
  id: string,
): Promise<void> {
  const db = database(env);
  await requireUsableConnection(db, userId);
  await requireNotionDatabase(db, userId, id);
  await removeNotionDatabase(db, id);
}

async function changedProjectSetup(
  client: NotionClient,
  owner: DatabaseOwner,
  current: NotionDatabaseRow,
  changes: UpdateNotionDatabaseBody,
): Promise<ProjectSetup> {
  const projectMode = changes.projectMode ?? current.projectMode;
  if (projectMode === "own" && current.projectMode !== "own") {
    const source = await requireDataSource(client, current.dataSourceId);
    const added = await ensureTrackerProperties(client, source, ["project"], owner);
    return {
      projectMode,
      ...projectPropertyColumns(null),
      propertyIds: { ...current.propertyIds, ...added },
    };
  }
  if (projectMode === "property" && changes.projectPropertyId !== undefined) {
    const source = await requireDataSource(client, current.dataSourceId);
    return {
      projectMode,
      ...projectPropertyColumns(projectPropertyOf(source, changes.projectPropertyId)),
    };
  }
  const kept = projectMode === "property" ? storedProjectProperty(current) : null;
  return { projectMode, ...projectPropertyColumns(kept) };
}

async function requireDataSource(client: NotionClient, id: string): Promise<DataSource> {
  const source = await retrieveDataSource(client, id);
  if (source === undefined) throw dataSourceNotFound();
  return source;
}

function projectPropertyOf(source: DataSource, id: string | undefined): NotionProperty {
  const property = projectPropertiesOf(source).find((candidate) => candidate.id === id);
  if (property === undefined) {
    throw validationError({
      projectPropertyId: "Expected a select or multi_select property of this database",
    });
  }
  return property;
}

async function ensureTrackerProperties(
  client: NotionClient,
  source: DataSource,
  wanted: TrackerProperty[],
  owner: DatabaseOwner,
): Promise<TrackerPropertyIds> {
  const { ids, missing } = matchTrackerProperties(source.properties, wanted, owner.locale);
  if (missing.length === 0) return ids;
  const updated = await addDataSourceProperties(client, source.id, missing);
  if (updated === undefined) throw dataSourceNotFound();
  return { ...ids, ...addedPropertyIds(updated.properties, missing) };
}
