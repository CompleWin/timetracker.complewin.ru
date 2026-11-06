import { expect } from "vitest";
import { api, type TestResponse, type TestSession } from "./api.ts";
import type { ExternalCall } from "./external.ts";
import { getNotionConnection, jsonBodyOf } from "./notion.ts";
import type { FakeDataSource, PropertySpec } from "./notion-workspace.ts";
import { requireStatus, type SessionOpts } from "./rest.ts";
import type { TestUser } from "./session.ts";

export type Locale = TestUser["locale"];

export type ProjectMode = "own" | "property" | "none";

export type BlockPosition = "start" | "end" | "none";

export type TestProjectProperty = {
  id: string;
  name: string;
  type: "select" | "multi_select";
};

export type TestStatusProperty = {
  id: string;
  name: string;
};

export type TestStatusOption = {
  id: string;
  name: string;
  complete: boolean;
};

export type TestNotionDatabase = {
  id: string;
  dataSourceId: string;
  databaseId: string;
  title: string;
  projectMode: ProjectMode;
  projectProperty: TestProjectProperty | null;
  statusProperty: TestStatusProperty | null;
  skippedStatusIds: string[];
  blockPosition: BlockPosition;
  timeProperties: boolean;
  isDefault: boolean;
  createdAt: string;
};

export type AvailableDatabase = {
  dataSourceId: string;
  databaseId: string;
  title: string;
  icon: string | null;
  addedId: string | null;
};

export type DatabaseSettings = {
  projectMode?: ProjectMode;
  projectPropertyId?: string;
  blockPosition?: BlockPosition;
  timeProperties?: boolean;
  isDefault?: boolean;
  skippedStatusIds?: string[];
};

export type DatabaseBody = DatabaseSettings & {
  dataSourceId: string;
};

export type TrackerField = "spentHours" | "spent" | "running" | "lastTracked" | "project";

export const MAX_DATABASES = 50;
export const STOPWATCH = "⏱";
export const TIME_FIELDS: TrackerField[] = ["spentHours", "spent", "running", "lastTracked"];
export const PROJECT_FIELD: TrackerField[] = ["project"];
export const ALL_TRACKER_FIELDS: TrackerField[] = [...TIME_FIELDS, ...PROJECT_FIELD];

const trackerFieldNames: Record<TrackerField, Record<Locale, string>> = {
  spentHours: { ru: `${STOPWATCH} Затрачено, ч`, en: `${STOPWATCH} Time spent, h` },
  spent: { ru: `${STOPWATCH} Затрачено`, en: `${STOPWATCH} Time spent` },
  running: { ru: `${STOPWATCH} Таймер идёт`, en: `${STOPWATCH} Timer running` },
  lastTracked: { ru: `${STOPWATCH} Последний трек`, en: `${STOPWATCH} Last tracked` },
  project: { ru: `${STOPWATCH} Проект`, en: `${STOPWATCH} Project` },
};

const trackerFieldTypes: Record<TrackerField, string> = {
  spentHours: "number",
  spent: "rich_text",
  running: "checkbox",
  lastTracked: "date",
  project: "select",
};

const AVAILABLE_PATH = "/api/notion/available-databases";
const DATABASES_PATH = "/api/notion/databases";

export function trackerFieldName(field: TrackerField, locale: Locale): string {
  return trackerFieldNames[field][locale];
}

export function trackerFieldSpecs(locale: Locale, fields: TrackerField[]): PropertySpec[] {
  return fields.map((field) => ({
    name: trackerFieldName(field, locale),
    type: trackerFieldTypes[field],
  }));
}

export function expectAddedFields(
  call: ExternalCall,
  locale: Locale,
  fields: TrackerField[],
): void {
  const properties = Object.fromEntries(
    trackerFieldSpecs(locale, fields).map(({ name, type }) => [name, { [type]: {} }]),
  );
  expect(jsonBodyOf(call)).toEqual({ properties });
}

export function callsFromNowOn(calls: () => ExternalCall[]): () => ExternalCall[] {
  const earlierCount = calls().length;
  return () => calls().slice(earlierCount);
}

export function databasePath(id: string): string {
  return `${DATABASES_PATH}/${id}`;
}

export function databaseBody(
  dataSource: FakeDataSource,
  settings: DatabaseSettings = {},
): DatabaseBody {
  return { dataSourceId: dataSource.id, projectMode: "own", blockPosition: "start", ...settings };
}

export function listAvailableDatabases(
  session: TestSession,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(AVAILABLE_PATH, { ...opts, as: session });
}

export function listAvailableProperties(
  session: TestSession,
  dataSourceId: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(`${AVAILABLE_PATH}/${dataSourceId}/properties`, { ...opts, as: session });
}

export function postDatabase(
  session: TestSession,
  body: unknown,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.post(DATABASES_PATH, body, { ...opts, as: session });
}

export async function addDatabase(
  session: TestSession,
  dataSource: FakeDataSource,
  settings: DatabaseSettings = {},
  opts: SessionOpts = {},
): Promise<TestNotionDatabase> {
  const response = await postDatabase(session, databaseBody(dataSource, settings), opts);
  return requireStatus(response, 201, `POST ${DATABASES_PATH}`).body.database;
}

export function patchDatabase(
  session: TestSession,
  id: string,
  body: unknown,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.patch(databasePath(id), body, { ...opts, as: session });
}

export async function updateDatabase(
  session: TestSession,
  id: string,
  settings: DatabaseSettings,
  opts: SessionOpts = {},
): Promise<TestNotionDatabase> {
  const response = await patchDatabase(session, id, settings, opts);
  return requireStatus(response, 200, `PATCH ${databasePath(id)}`).body.database;
}

export function deleteDatabase(
  session: TestSession,
  id: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.delete(databasePath(id), { ...opts, as: session });
}

export async function connectedDatabases(session: TestSession): Promise<TestNotionDatabase[]> {
  const response = await getNotionConnection(session);
  return requireStatus(response, 200, "GET /api/notion/connection").body.connection.databases;
}

export async function defaultDatabaseIds(session: TestSession): Promise<string[]> {
  const databases = await connectedDatabases(session);
  return databases.filter((database) => database.isDefault).map((database) => database.id);
}
