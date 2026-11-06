import type { TestSession } from "./api.ts";
import { atMinute } from "./clock.ts";
import type { ExternalCall } from "./external.ts";
import type { FakePage, NotionFailure, PageValue } from "./notion-pages.ts";
import {
  projectOfTask,
  projectsNamed,
  queryBodyOf,
  statusProperty,
  type FakeNotionPull,
} from "./notion-pull.ts";
import type { DatabaseSetup, SyncedDatabase, SyncedTask } from "./notion-sync.ts";
import type { FakeDataSource, FakeOption, FakeProperty } from "./notion-workspace.ts";
import type { TestProject } from "./projects.ts";
import { requireStatus, type SessionOpts } from "./rest.ts";
import { listTasks } from "./tasks.ts";

export const TASKS_TITLE = "Tasks";
export const STATUS = "Статус";
export const NOT_STARTED = "Not started";
export const IN_PROGRESS = "In progress";
export const REVIEW = "Review";
export const DONE = "Done";
export const NO_STATUS: PageValue = { status: null };

export const TASKS_BASE: DatabaseSetup = { title: TASKS_TITLE, projectMode: "none" };
export const TASKS_BASE_WITH_STATUS: DatabaseSetup = {
  ...TASKS_BASE,
  properties: [
    statusProperty(STATUS, {
      "To-do": [NOT_STARTED],
      "In progress": [IN_PROGRESS],
      Complete: [REVIEW, DONE],
    }),
  ],
};

export const PAGE_EDIT = atMinute(5);
export const IMPORT_RUN = atMinute(10);
export const EDIT_AFTER_IMPORT = atMinute(15);
export const NEXT_RUN = atMinute(20);
export const LATER_RUN = atMinute(30);
export const LAST_RUN = atMinute(40);

export const rejectedCursor: NotionFailure = {
  status: 400,
  code: "validation_error",
  message: "The start_cursor provided is invalid",
};

export function pageIn(
  fake: FakeNotionPull,
  { dataSource }: SyncedDatabase,
  title: string,
  values: Record<string, PageValue> = {},
  editedAt: { now: string } = PAGE_EDIT,
): FakePage {
  return fake.pageInNotion(dataSource, { title, values, editedAt });
}

export function pagesIn(
  fake: FakeNotionPull,
  database: SyncedDatabase,
  count: number,
  editedAt: (index: number) => { now: string },
): FakePage[] {
  return Array.from({ length: count }, (_, index) =>
    pageIn(fake, database, `Запись ${index + 1}`, {}, editedAt(index)),
  );
}

export function statusFieldOf(dataSource: FakeDataSource): FakeProperty {
  const property = dataSource.properties.find(({ type }) => type === "status");
  if (!property) throw new Error(`Data source ${dataSource.id} has no status property`);
  return property;
}

export function statusOption(dataSource: FakeDataSource, name: string): FakeOption {
  const option = statusFieldOf(dataSource).options?.find((candidate) => candidate.name === name);
  if (!option) throw new Error(`Data source ${dataSource.id} has no status ${name}`);
  return option;
}

export function statusIds(dataSource: FakeDataSource, names: string[]): string[] {
  return names.map((name) => statusOption(dataSource, name).id);
}

export function withStatus(dataSource: FakeDataSource, name: string): Record<string, PageValue> {
  return { [statusFieldOf(dataSource).id]: { status: statusOption(dataSource, name) } };
}

export function withoutStatus(dataSource: FakeDataSource): Record<string, PageValue> {
  return { [statusFieldOf(dataSource).id]: NO_STATUS };
}

export async function activeTasks(
  session: TestSession,
  opts: SessionOpts = {},
): Promise<SyncedTask[]> {
  return requireStatus(await listTasks(session, {}, opts), 200, "GET /api/tasks").body.tasks;
}

export async function taskOfPage(
  session: TestSession,
  page: FakePage,
  opts: SessionOpts = {},
): Promise<SyncedTask> {
  const tasks = await activeTasks(session, opts);
  const found = tasks.find((task) => task.notionPageUrl === page.url);
  if (!found) throw new Error(`No active task is linked to page ${page.id}`);
  return found;
}

export async function projectOfPage(
  session: TestSession,
  page: FakePage,
  opts: SessionOpts = {},
): Promise<TestProject | null> {
  const task = await taskOfPage(session, page, opts);
  return projectOfTask(session, task.id, opts);
}

export async function onlyProjectNamed(
  session: TestSession,
  name: string,
  opts: SessionOpts = {},
): Promise<TestProject> {
  const [project, ...others] = await projectsNamed(session, name, opts);
  if (!project || others.length > 0) throw new Error(`Expected exactly one project ${name}`);
  return project;
}

export function startCursorOf(call: ExternalCall): unknown {
  return queryBodyOf(call).start_cursor;
}

export function filterOf(call: ExternalCall): unknown {
  return queryBodyOf(call).filter;
}
