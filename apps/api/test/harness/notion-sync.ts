import { api, type TestResponse, type TestSession } from "./api.ts";
import { atMinute } from "./clock.ts";
import { runCron } from "./cron.ts";
import type { ExternalCall } from "./external.ts";
import {
  addDatabase,
  callsFromNowOn,
  trackerFieldName,
  type DatabaseSettings,
  type Locale,
  type TestNotionDatabase,
  type TrackerField,
} from "./notion-databases.ts";
import {
  fakeNotionPages,
  type FakeNotionPages,
  type FakePage,
  type PageValue,
} from "./notion-pages.ts";
import {
  fakeNotionWorkspace,
  isDataSourceQuery,
  isRecord,
  type FakeDataSource,
  type FakeNotionWorkspace,
  type FakeProperty,
  type PropertySpec,
} from "./notion-workspace.ts";
import { fakeNotion, jsonBodyOf, notionWorkspace, type FakeNotion } from "./notion.ts";
import { requireStatus, type SessionOpts } from "./rest.ts";
import { loginAs } from "./session.ts";
import { getTask, type TestTask } from "./tasks.ts";

export type DatabaseSetup = Omit<DatabaseSettings, "projectPropertyId"> & {
  title: string;
  properties?: PropertySpec[];
  projectProperty?: string;
};

export type NotionSetup<Key extends string> = {
  databases: Record<Key, DatabaseSetup>;
};

export type SyncedDatabase = {
  database: TestNotionDatabase;
  dataSource: FakeDataSource;
};

export type SyncedTask = TestTask & {
  notionPageUrl: string | null;
  notionDatabaseId: string | null;
};

export type NotionEdit = {
  editedAt: { now: string };
  title?: string;
  values?: Record<string, PageValue>;
};

export type NewNotionPage = NotionEdit & {
  title: string;
};

export type FailedSync = {
  taskId: string;
  title: string;
  error: string;
  attempts: number;
};

export type TestSyncStatus = {
  pendingTasks: number;
  failed: FailedSync[];
  lastRunAt: string | null;
};

export type FakeNotionSync = {
  notion: FakeNotion;
  workspace: FakeNotionWorkspace;
  pages: FakeNotionPages;
  connectNotion<Key extends string>(
    session: TestSession,
    setup: NotionSetup<Key>,
  ): Promise<Record<Key, SyncedDatabase>>;
  pageInNotion(dataSource: FakeDataSource, page: NewNotionPage): FakePage;
  editInNotion(page: FakePage, edit: NotionEdit): void;
  pageOfTask(session: TestSession, taskId: string): Promise<FakePage>;
  requestsDuring(action: () => Promise<unknown>): Promise<ExternalCall[]>;
  requestsExceptPullDuring(action: () => Promise<unknown>): Promise<ExternalCall[]>;
  creationsDuring(action: () => Promise<unknown>): Promise<ExternalCall[]>;
  updatesDuring(page: FakePage, action: () => Promise<unknown>): Promise<ExternalCall[]>;
};

export const SETUP_TIME = atMinute(0);
export const TASK_TITLE = "Anki";
export const TASKS_DATABASE: DatabaseSetup = { title: "Задачи" };
export const FUN_DATABASE: DatabaseSetup = { title: "Развлечения" };

const SYNC_PATH = "/api/notion/sync";
const SETUP_DEFAULTS: DatabaseSettings = { blockPosition: "none", timeProperties: true };

export function fakeNotionSync(): FakeNotionSync {
  const notion = fakeNotion();
  const workspace = fakeNotionWorkspace();
  const pages = fakeNotionPages(workspace);

  function projectSettings(dataSource: FakeDataSource, propertyName?: string): DatabaseSettings {
    if (propertyName === undefined) return {};
    const projectPropertyId = workspace.property(dataSource, propertyName).id;
    return { projectMode: "property", projectPropertyId };
  }

  async function addSyncedDatabase(
    session: TestSession,
    { title, properties, projectProperty, ...settings }: DatabaseSetup,
  ): Promise<SyncedDatabase> {
    const dataSource = workspace.dataSource({ title: [title], properties });
    const database = await addDatabase(
      session,
      dataSource,
      { ...SETUP_DEFAULTS, ...projectSettings(dataSource, projectProperty), ...settings },
      SETUP_TIME,
    );
    return { database, dataSource };
  }

  async function connectNotion<Key extends string>(
    session: TestSession,
    { databases }: NotionSetup<Key>,
  ): Promise<Record<Key, SyncedDatabase>> {
    await notion.connect(session, notionWorkspace, SETUP_TIME);
    const added: [string, SyncedDatabase][] = [];
    for (const [key, setup] of Object.entries<DatabaseSetup>(databases)) {
      added.push([key, await addSyncedDatabase(session, setup)]);
    }
    return Object.fromEntries(added) as Record<Key, SyncedDatabase>;
  }

  function dataSourceOf(page: FakePage): FakeDataSource {
    const found = workspace.dataSourceById(page.dataSourceId);
    if (!found) throw new Error(`Page ${page.id} is outside known data sources`);
    return found;
  }

  function editInNotion(page: FakePage, { editedAt, title, values = {} }: NotionEdit): void {
    const titleValues =
      title === undefined ? {} : { [titlePropertyId(dataSourceOf(page))]: titleValue(title) };
    for (const [propertyId, value] of Object.entries({ ...values, ...titleValues })) {
      page.values.set(propertyId, value);
    }
    page.lastEditedTime = editedAt.now;
  }

  function pageInNotion(dataSource: FakeDataSource, newPage: NewNotionPage): FakePage {
    const page = pages.create(dataSource.id);
    editInNotion(page, newPage);
    return page;
  }

  async function pageOfTask(session: TestSession, taskId: string): Promise<FakePage> {
    const task = await readTask(session, taskId, SETUP_TIME);
    return pages.byUrl(task.notionPageUrl);
  }

  return {
    notion,
    workspace,
    pages,
    connectNotion,
    pageInNotion,
    editInNotion,
    pageOfTask,
    requestsDuring: (action) => callsDuring(() => notion.requests(), action),
    requestsExceptPullDuring: (action) =>
      callsDuring(() => notion.requests().filter((call) => !isDataSourceQuery(call)), action),
    creationsDuring: (action) => callsDuring(() => pages.creations(), action),
    updatesDuring: (page, action) => callsDuring(() => pages.updates(page), action),
  };
}

export async function loginForSync(locale: Locale = "ru"): Promise<TestSession> {
  const { session } = await loginAs({ locale }, SETUP_TIME);
  return session;
}

export function cronAt(time: { now: string }): Promise<void> {
  return runCron(time.now);
}

export async function callsDuring(
  calls: () => ExternalCall[],
  action: () => Promise<unknown>,
): Promise<ExternalCall[]> {
  const newCalls = callsFromNowOn(calls);
  await action();
  return newCalls();
}

export function propertyNamed(dataSource: FakeDataSource, name: string): FakeProperty {
  return propertyWhere(dataSource, (property) => property.name === name, name);
}

export function titlePropertyId(dataSource: FakeDataSource): string {
  return propertyWhere(dataSource, (property) => property.type === "title", "title").id;
}

export function trackerPropertyId(dataSource: FakeDataSource, field: TrackerField): string {
  const names = [trackerFieldName(field, "ru"), trackerFieldName(field, "en")];
  return propertyWhere(dataSource, (property) => names.includes(property.name), field).id;
}

export function titleValue(content: string): Record<string, unknown> {
  return { title: [{ text: { content } }] };
}

export function richTextValue(content: string): Record<string, unknown> {
  return { rich_text: [{ text: { content } }] };
}

export function pagePropertiesOf(call: ExternalCall): Record<string, unknown> {
  const body = jsonBodyOf(call);
  return isRecord(body) && isRecord(body.properties) ? body.properties : {};
}

export function getSyncStatus(session: TestSession, opts: SessionOpts = {}): Promise<TestResponse> {
  return api.get(SYNC_PATH, { ...opts, as: session });
}

export async function syncStatus(
  session: TestSession,
  opts: SessionOpts = {},
): Promise<TestSyncStatus> {
  return requireStatus(await getSyncStatus(session, opts), 200, `GET ${SYNC_PATH}`).body;
}

export function retrySync(session: TestSession, opts: SessionOpts = {}): Promise<TestResponse> {
  return api.post(`${SYNC_PATH}/retry`, undefined, { ...opts, as: session });
}

export async function readTask(
  session: TestSession,
  id: string,
  opts: SessionOpts = {},
): Promise<SyncedTask> {
  return requireStatus(await getTask(session, id, opts), 200, `GET /api/tasks/${id}`).body.task;
}

function propertyWhere(
  dataSource: FakeDataSource,
  matches: (property: FakeProperty) => boolean,
  description: string,
): FakeProperty {
  const found = dataSource.properties.find(matches);
  if (!found) throw new Error(`Data source ${dataSource.id} has no property ${description}`);
  return found;
}
