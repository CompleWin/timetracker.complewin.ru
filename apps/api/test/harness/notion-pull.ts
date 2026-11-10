import { api, type TestResponse, type TestSession } from "./api.ts";
import { external, type ExternalCall } from "./external.ts";
import {
  failureResponse,
  type FakePage,
  type NotionFailure,
  type PageValue,
} from "./notion-pages.ts";
import {
  TASKS_DATABASE,
  callsDuring,
  fakeNotionSync,
  loginForSync,
  pagePropertiesOf,
  readTask,
  type DatabaseSetup,
  type FakeNotionSync,
  type SyncedDatabase,
  type SyncedTask,
} from "./notion-sync.ts";
import {
  NOTION_V1,
  QUERY_PATTERN,
  isRecord,
  readJson,
  resourceId,
  type FakeDataSource,
  type FakeOption,
  type PropertySpec,
} from "./notion-workspace.ts";
import { jsonBodyOf } from "./notion.ts";
import { getProject, listProjects, type ProjectColor, type TestProject } from "./projects.ts";
import { requireStatus, withQuery, type SessionOpts } from "./rest.ts";

export type NotionOption = {
  name: string;
  color: ProjectColor;
};

export type PageSearch = {
  databaseId?: string;
  q?: string;
  includeCompleted?: boolean;
};

export type LinkBody = {
  projectId?: string;
};

export type UserWithDatabase = {
  session: TestSession;
  added: SyncedDatabase;
};

export type FakeNotionPull = FakeNotionSync & {
  failQueries(failure: NotionFailure, times?: number): void;
  queriesDuring(action: () => Promise<unknown>): Promise<ExternalCall[]>;
};

const PAGES_PATH = "/api/notion/pages";
const DEFAULT_PAGE_SIZE = 100;

export function fakeNotionPull(): FakeNotionPull {
  const sync = fakeNotionSync();
  const failures: NotionFailure[] = [];

  external.on("POST", QUERY_PATTERN, async (request) => {
    const failure = failures.shift();
    if (failure) return failureResponse(failure);
    const body = await readJson(request);
    const found = sync.pages
      .list()
      .filter((page) => page.dataSourceId === resourceId(request) && !page.inTrash)
      .filter((page) => matchesFilter(page, body.filter));
    return Response.json(queryResultJson(sortedByEditTime(found, body.sorts), body));
  });

  function queryResultJson(
    pages: FakePage[],
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const start = typeof body.start_cursor === "string" ? Number(body.start_cursor) : 0;
    const size = typeof body.page_size === "number" ? body.page_size : DEFAULT_PAGE_SIZE;
    const end = start + size;
    const hasMore = end < pages.length;
    return {
      object: "list",
      results: pages.slice(start, end).map(sync.pages.json),
      has_more: hasMore,
      next_cursor: hasMore ? String(end) : null,
    };
  }

  return {
    ...sync,
    failQueries: (failure, times = 1) => {
      failures.push(...Array.from({ length: times }, () => failure));
    },
    queriesDuring: (action) => callsDuring(() => sync.workspace.queries(), action),
  };
}

export async function userWithDatabase(
  fake: FakeNotionSync,
  database: DatabaseSetup = TASKS_DATABASE,
): Promise<UserWithDatabase> {
  const session = await loginForSync();
  const { added } = await fake.connectNotion(session, { databases: { added: database } });
  return { session, added };
}

export function queryUrlOf(dataSource: FakeDataSource): string {
  return `${NOTION_V1}/data_sources/${dataSource.id}/query`;
}

export function optionsProperty(
  name: string,
  type: "select" | "multi_select",
  options: NotionOption[],
): PropertySpec {
  return { name, type, options: options.map(fakeOption) };
}

export function statusProperty(name: string, groups: Record<string, string[]>): PropertySpec {
  const grouped = Object.entries(groups).map(([groupName, optionNames]) => ({
    groupName,
    options: optionNames.map((optionName) => fakeOption({ name: optionName, color: "default" })),
  }));
  return {
    name,
    type: "status",
    options: grouped.flatMap(({ options }) => options),
    groups: grouped.map(({ groupName, options }) => ({
      id: crypto.randomUUID(),
      name: groupName,
      optionIds: options.map(({ id }) => id),
    })),
  };
}

export function selectValue(option: NotionOption | null): PageValue {
  return { select: option && { name: option.name, color: option.color } };
}

export function multiSelectValue(names: string[]): PageValue {
  return { multi_select: names.map((name) => ({ name, color: "default" })) };
}

export function searchPages(
  session: TestSession,
  search: PageSearch = {},
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(withQuery(PAGES_PATH, searchParams(search)), { ...opts, as: session });
}

export function requestLink(
  session: TestSession,
  pageId: string,
  body: LinkBody = {},
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.post(linkPath(pageId), body, { ...opts, as: session });
}

export async function linkPage(
  session: TestSession,
  pageId: string,
  body: LinkBody = {},
  opts: SessionOpts = {},
): Promise<SyncedTask> {
  const response = await requestLink(session, pageId, body, opts);
  return requireStatus(response, 201, `POST ${linkPath(pageId)}`).body.task;
}

export async function projectOfTask(
  session: TestSession,
  taskId: string,
  opts: SessionOpts = {},
): Promise<TestProject | null> {
  const { projectId } = await readTask(session, taskId, opts);
  if (projectId === null) return null;
  const response = await getProject(session, projectId, opts);
  return requireStatus(response, 200, `GET /api/projects/${projectId}`).body.project;
}

export async function projectsNamed(
  session: TestSession,
  name: string,
  opts: SessionOpts = {},
): Promise<TestProject[]> {
  const response = await listProjects(session, {}, opts);
  const projects: TestProject[] = requireStatus(response, 200, "GET /api/projects").body.projects;
  return projects.filter((project) => project.name.toLowerCase() === name.toLowerCase());
}

export function queryBodyOf(call: ExternalCall): Record<string, unknown> {
  const body = jsonBodyOf(call);
  return isRecord(body) ? body : {};
}

export function filterConditionsOf(call: ExternalCall): unknown[] {
  const { filter } = queryBodyOf(call);
  return isRecord(filter) && Array.isArray(filter.and) ? filter.and : [];
}

export function cursorOf(call: ExternalCall): number {
  const { filter } = queryBodyOf(call);
  const condition = isRecord(filter) ? filter.last_edited_time : undefined;
  return isRecord(condition) && typeof condition.on_or_after === "string"
    ? Date.parse(condition.on_or_after)
    : Number.NaN;
}

export function sendsProperty(call: ExternalCall, propertyId: string): boolean {
  return propertyId in pagePropertiesOf(call);
}

function linkPath(pageId: string): string {
  return `${PAGES_PATH}/${pageId}/link`;
}

function searchParams({ databaseId, q, includeCompleted }: PageSearch): Record<string, string> {
  const params: Record<string, string> = {};
  if (databaseId !== undefined) params.databaseId = databaseId;
  if (q !== undefined) params.q = q;
  if (includeCompleted !== undefined) params.includeCompleted = String(includeCompleted);
  return params;
}

function fakeOption({ name, color }: NotionOption): FakeOption {
  return { id: crypto.randomUUID(), name, color };
}

function matchesFilter(page: FakePage, filter: unknown): boolean {
  if (!isRecord(filter)) return true;
  if (Array.isArray(filter.and)) return filter.and.every((part) => matchesFilter(page, part));
  if (filter.timestamp === "last_edited_time")
    return editedOnOrAfter(page, filter.last_edited_time);
  if (typeof filter.property === "string" && isRecord(filter.title)) {
    return titleContains(page, filter.property, filter.title.contains);
  }
  return true;
}

function editedOnOrAfter(page: FakePage, condition: unknown): boolean {
  if (!isRecord(condition) || typeof condition.on_or_after !== "string") return true;
  return Date.parse(page.lastEditedTime) >= Date.parse(condition.on_or_after);
}

function titleContains(page: FakePage, propertyId: string, text: unknown): boolean {
  if (typeof text !== "string") return true;
  return plainTitleOf(page.values.get(propertyId)).toLowerCase().includes(text.toLowerCase());
}

function plainTitleOf(value: PageValue | undefined): string {
  const items = value && Array.isArray(value.title) ? value.title : [];
  return items
    .map((item) =>
      isRecord(item) && isRecord(item.text) && typeof item.text.content === "string"
        ? item.text.content
        : "",
    )
    .join("");
}

function sortedByEditTime(pages: FakePage[], sorts: unknown): FakePage[] {
  const [sort] = Array.isArray(sorts) ? sorts : [];
  const direction = isRecord(sort) && sort.direction === "descending" ? -1 : 1;
  return pages.toSorted(
    (left, right) =>
      direction * (Date.parse(left.lastEditedTime) - Date.parse(right.lastEditedTime)),
  );
}
