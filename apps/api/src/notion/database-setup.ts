import {
  MAX_NOTION_DATABASES,
  notionTimeFields,
  type AddNotionDatabaseBody,
  type NotionDatabase,
  type NotionProperty,
  type NotionTimeField,
  type NotionTimeFieldChoices,
  type UpdateNotionDatabaseBody,
  type User,
} from "@stt/shared";
import { database, type Database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { databaseAlreadyAdded, tooManyDatabases, validationError } from "../http/errors.ts";
import { enqueueBlockInheritingTasks, enqueueDatabaseTasks } from "../sync/outbox.ts";
import { notionClient, type NotionClient } from "./client.ts";
import { requireUsableConnection, type ConnectedRow } from "./connections.ts";
import {
  addDataSourceProperties,
  completeStatusIds,
  projectPropertiesOf,
  retrieveDataSource,
  statusFieldOf,
  titlePropertyId,
  withDatabaseTitle,
  type DataSource,
  type StatusField,
} from "./data-sources.ts";
import {
  countNotionDatabases,
  findDatabaseOfDataSource,
  insertNotionDatabase,
  projectPropertyColumns,
  removeNotionDatabase,
  requireNotionDatabase,
  statusFilterColumns,
  storedProjectProperty,
  toNotionDatabase,
  updateNotionDatabase,
  type NotionDatabaseChanges,
  type NotionDatabaseRow,
} from "./databases.ts";
import {
  addedPropertyIds,
  matchTrackerProperties,
  newlyNeededProperties,
  planSelectedTimeFields,
  selectTimeFieldIds,
  timeFieldIdsOf,
  trackerPropertiesFor,
  type TimeFieldSettings,
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

const notStatusOption = () =>
  validationError({ skippedStatusIds: "Expected status options of this database" });

const RESTARTED_PULL = {
  pullCursor: null,
  pullNextCursor: null,
  pullLatestEdit: null,
  pulledAt: null,
};

type DataSourceLoader = () => Promise<DataSource>;

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
  defaultTimeFields?: readonly NotionTimeField[],
): Promise<NotionDatabaseRow> {
  checkDurationFormats(settings.timeFields);
  const added = await findDatabaseOfDataSource(db, owner.id, settings.dataSourceId);
  if (added !== undefined) throw databaseAlreadyAdded(added.id);
  if ((await countNotionDatabases(db, owner.id)) >= MAX_NOTION_DATABASES) throw tooManyDatabases();
  const source = await withDatabaseTitle(
    client,
    await requireDataSource(client, settings.dataSourceId),
  );
  const projectProperty =
    settings.projectMode === "property"
      ? projectPropertyOf(source, settings.projectPropertyId)
      : null;
  const statusField = statusFieldOf(source);
  const skippedStatusIds = checkedStatusIds(
    statusField,
    settings.skippedStatusIds ?? completeStatusIds(statusField),
  );
  const timeProperties = settings.timeProperties === true;
  const wanted = [
    ...trackerPropertiesFor({ projectMode: settings.projectMode, timeProperties }),
    ...(defaultTimeFields ?? []),
  ];
  const ids = await ensureTrackerProperties(client, source, wanted, owner, settings.timeFields);
  const timeFieldSettings =
    settings.timeFields === undefined && defaultTimeFields === undefined
      ? null
      : selectedTimeFieldSettings(ids, undefined, defaultTimeFields);
  const values = {
    userId: owner.id,
    connectionId,
    databaseId: source.databaseId,
    dataSourceId: source.id,
    title: source.title,
    propertyIds: { title: titlePropertyId(source), ...automaticIds(ids, timeFieldSettings) },
    projectMode: settings.projectMode,
    ...projectPropertyColumns(projectProperty),
    ...statusFilterColumns(statusField, skippedStatusIds),
    blockPosition: settings.blockPosition,
    timeProperties,
    timeFieldSettings,
    createdAt: now,
  };
  return insertNotionDatabase(db, values);
}

export async function changeNotionDatabase(
  env: Bindings,
  owner: DatabaseOwner,
  id: string,
  changes: UpdateNotionDatabaseBody,
  now: Date,
): Promise<NotionDatabase> {
  const db = database(env);
  const connection = await requireUsableConnection(db, owner.id);
  const current = await requireNotionDatabase(db, owner.id, id);
  const retainingBothFormats = checkDurationFormats(changes.timeFields, current);
  const client = notionClient(env, connection);
  const dataSource = dataSourceLoader(client, current.dataSourceId);
  const next = {
    projectMode: changes.projectMode ?? current.projectMode,
    timeProperties:
      changes.timeFields === undefined ? (changes.timeProperties ?? current.timeProperties) : false,
  };
  const projectProperty = await changedProjectProperty(dataSource, current, changes);
  const statusFilter = await changedStatusFilter(dataSource, current, changes);
  const added = await addTrackerProperties(
    client,
    dataSource,
    newlyNeededProperties(current, next),
    owner,
    changes.timeFields,
  );
  const timeFieldSettings =
    changes.timeFields === undefined
      ? changes.timeProperties === undefined
        ? undefined
        : null
      : selectedTimeFieldSettings(added, current);
  const automatic = automaticIds(added, timeFieldSettings);
  const updated = await updateNotionDatabase(
    db,
    current,
    {
      projectMode: changes.projectMode,
      timeProperties: timeFieldSettings === undefined ? undefined : next.timeProperties,
      ...projectPropertyColumns(projectProperty),
      ...statusFilter,
      propertyIds:
        Object.keys(automatic).length > 0 ? { ...current.propertyIds, ...automatic } : undefined,
      timeFieldSettings,
      blockPosition: changes.blockPosition,
    },
    retainingBothFormats
      ? () => validationError({ timeFields: "Duration settings changed" })
      : undefined,
  );
  if (updated.blockPosition !== current.blockPosition) {
    await enqueueBlockInheritingTasks(db, owner.id, id, now);
  }
  if (
    timeFieldSettings?.revision &&
    timeFieldSettings.revision !== current.timeFieldSettings?.revision
  ) {
    await enqueueDatabaseTasks(db, owner.id, id, now);
  }
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

async function changedProjectProperty(
  dataSource: DataSourceLoader,
  current: NotionDatabaseRow,
  changes: UpdateNotionDatabaseBody,
): Promise<NotionProperty | null> {
  if ((changes.projectMode ?? current.projectMode) !== "property") return null;
  if (changes.projectPropertyId === undefined) return storedProjectProperty(current);
  return projectPropertyOf(await dataSource(), changes.projectPropertyId);
}

async function changedStatusFilter(
  dataSource: DataSourceLoader,
  current: NotionDatabaseRow,
  { skippedStatusIds }: UpdateNotionDatabaseBody,
): Promise<NotionDatabaseChanges> {
  if (skippedStatusIds === undefined) return {};
  const field = statusFieldOf(await dataSource());
  const next = checkedStatusIds(field, skippedStatusIds);
  const returned = (current.skippedStatusIds ?? []).some((id) => !next.includes(id));
  return { ...statusFilterColumns(field, next), ...(returned && RESTARTED_PULL) };
}

function checkedStatusIds(field: StatusField | null, wanted: string[]): string[] {
  const known = new Set(field?.statuses.map(({ id }) => id));
  if (wanted.some((id) => !known.has(id))) throw notStatusOption();
  return [...new Set(wanted)];
}

async function addTrackerProperties(
  client: NotionClient,
  dataSource: DataSourceLoader,
  wanted: TrackerProperty[],
  owner: DatabaseOwner,
  timeFields: NotionTimeFieldChoices | undefined,
): Promise<TrackerPropertyIds> {
  if (wanted.length === 0 && Object.keys(timeFields ?? {}).length === 0) return {};
  return ensureTrackerProperties(client, await dataSource(), wanted, owner, timeFields);
}

function checkDurationFormats(
  choices: NotionTimeFieldChoices | undefined,
  current?: NotionDatabaseRow,
): boolean {
  const text = choices?.spent;
  const hours = choices?.spentHours;
  if (text === undefined || hours === undefined) return false;

  const saved = current === undefined ? {} : timeFieldIdsOf(current);
  if (
    text.mode === "existing" &&
    hours.mode === "existing" &&
    text.propertyId === saved.spent &&
    hours.propertyId === saved.spentHours
  ) {
    return true;
  }
  throw validationError({ timeFields: "Choose one duration format" });
}

function selectedTimeFieldSettings(
  ids: TrackerPropertyIds,
  current?: NotionDatabaseRow,
  defaults?: readonly NotionTimeField[],
): TimeFieldSettings {
  const propertyIds = selectTimeFieldIds(ids);
  if (Object.keys(propertyIds).length === 0) return { propertyIds, revision: null };
  const previousIds = current === undefined ? {} : timeFieldIdsOf(current);
  const newlyEnabled = notionTimeFields.some(
    (field) => propertyIds[field] !== undefined && propertyIds[field] !== previousIds[field],
  );
  const revision = newlyEnabled
    ? crypto.randomUUID()
    : (current?.timeFieldSettings?.revision ?? null);
  const automaticFields =
    defaults ??
    current?.timeFieldSettings?.automaticFields?.filter(
      (field) => propertyIds[field] !== undefined && propertyIds[field] === previousIds[field],
    );
  return { propertyIds, revision, ...(automaticFields?.length && { automaticFields }) };
}

function automaticIds(
  ids: TrackerPropertyIds,
  settings: TimeFieldSettings | null | undefined,
): TrackerPropertyIds {
  if (settings == null) return ids;
  return ids.project === undefined ? {} : { project: ids.project };
}

function dataSourceLoader(client: NotionClient, id: string): DataSourceLoader {
  let loaded: Promise<DataSource> | undefined;
  return () => (loaded ??= requireDataSource(client, id));
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

export async function ensureTrackerProperties(
  client: NotionClient,
  source: DataSource,
  wanted: TrackerProperty[],
  owner: DatabaseOwner,
  timeFields?: NotionTimeFieldChoices,
): Promise<TrackerPropertyIds> {
  const plan = matchTrackerProperties(source.properties, wanted, owner.locale);
  if (timeFields !== undefined) planSelectedTimeFields(source.properties, timeFields, plan);
  const { ids, missing } = plan;
  if (missing.length === 0) return ids;
  const updated = await addDataSourceProperties(client, source.id, missing);
  if (updated === undefined) throw dataSourceNotFound();
  return { ...ids, ...addedPropertyIds(updated.properties, missing) };
}
