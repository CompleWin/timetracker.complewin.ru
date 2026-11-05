import { external, type ExternalCall } from "./external.ts";
import { testEnv } from "./test-env.ts";

export type NotionIcon =
  { type: "emoji"; emoji: string } | { type: "external"; external: { url: string } };

export type FakeOption = {
  id: string;
  name: string;
  color: string;
};

export type FakeStatusGroup = {
  id: string;
  name: string;
  optionIds: string[];
};

export type PropertySpec = {
  name: string;
  type: string;
  options?: FakeOption[];
  groups?: FakeStatusGroup[];
};

export type FakeProperty = PropertySpec & {
  id: string;
};

export type FakeDataSource = {
  id: string;
  databaseId: string;
  title: string[];
  databaseTitle: string[];
  icon: NotionIcon | null;
  properties: FakeProperty[];
};

export type DataSourceInput = {
  title?: string[];
  databaseTitle?: string[];
  icon?: NotionIcon | null;
  properties?: PropertySpec[];
};

export type FakeNotionWorkspace = {
  dataSource(input?: DataSourceInput): FakeDataSource;
  dataSourceById(id: string): FakeDataSource | undefined;
  property(dataSource: FakeDataSource, name: string): FakeProperty;
  hideDatabase(dataSource: FakeDataSource): void;
  splitSearch(...pages: FakeDataSource[][]): void;
  searchEndlessly(): void;
  templatePage(dataSource: FakeDataSource): string;
  pageWithoutDatabases(): string;
  searchRequests(): ExternalCall[];
  databaseReads(): ExternalCall[];
  dataSourceReads(dataSource: FakeDataSource): ExternalCall[];
  schemaUpdates(dataSource: FakeDataSource): ExternalCall[];
  queries(dataSource?: FakeDataSource): ExternalCall[];
};

type SearchPage = {
  results: FakeDataSource[];
  hasMore: boolean;
};

type Block = {
  id: string;
  type: string;
  content: Record<string, unknown>;
};

export const NOTION_V1 = `${testEnv.NOTION_API_BASE}/v1`;
const SEARCH_URL = `${NOTION_V1}/search`;
const DATABASE_PATTERN = resourcePattern("databases");
export const QUERY_PATTERN = resourcePattern("data_sources", "/query");
const EMPTY_QUERY_RESULT = { object: "list", results: [], has_more: false, next_cursor: null };
const CURSOR_PREFIX = "cursor-";
const TITLE_PROPERTY: PropertySpec = { name: "Name", type: "title" };
const OPTION_TYPES = new Set(["select", "multi_select"]);

export function fakeNotionWorkspace(): FakeNotionWorkspace {
  const dataSources = new Map<string, FakeDataSource>();
  const hiddenDatabaseIds = new Set<string>();
  const pages = new Map<string, Block[]>();
  let propertyCount = 0;
  let searchPageAt = (index: number): SearchPage => pageOf([[...dataSources.values()]], index);

  external.on("POST", SEARCH_URL, async (request) => {
    const index = pageIndexOf((await readJson(request)).start_cursor);
    return Response.json(searchJson(searchPageAt(index), index));
  });

  external.on("GET", resourcePattern("data_sources"), (request) => {
    const found = dataSources.get(resourceId(request));
    return found ? Response.json(dataSourceJson(found)) : notFound();
  });

  external.on("PATCH", resourcePattern("data_sources"), async (request) => {
    const found = dataSources.get(resourceId(request));
    if (!found) return notFound();
    const additions = propertySpecsOf((await readJson(request)).properties);
    found.properties.push(...additions.map(newProperty));
    return Response.json(dataSourceJson(found));
  });

  external.on("POST", QUERY_PATTERN, () => Response.json(EMPTY_QUERY_RESULT));

  external.on("GET", DATABASE_PATTERN, (request) => {
    const id = resourceId(request);
    if (hiddenDatabaseIds.has(id)) return notFound();
    const sources = [...dataSources.values()].filter((source) => source.databaseId === id);
    return sources.length > 0 ? Response.json(databaseJson(id, sources)) : notFound();
  });

  external.on("GET", resourcePattern("blocks", "/children"), (request) => {
    const children = pages.get(resourceId(request));
    return children ? Response.json(listJson(children.map(blockJson), "block")) : notFound();
  });

  function newProperty(spec: PropertySpec): FakeProperty {
    propertyCount += 1;
    return { ...spec, id: `prop${propertyCount}` };
  }

  function dataSource({
    title = ["Задачи"],
    databaseTitle = title,
    icon = null,
    properties = [],
  }: DataSourceInput = {}): FakeDataSource {
    const created: FakeDataSource = {
      id: crypto.randomUUID(),
      databaseId: crypto.randomUUID(),
      title,
      databaseTitle,
      icon,
      properties: [TITLE_PROPERTY, ...properties].map(newProperty),
    };
    dataSources.set(created.id, created);
    return created;
  }

  function property(source: FakeDataSource, name: string): FakeProperty {
    const found = source.properties.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`Data source ${source.id} has no property ${name}`);
    return found;
  }

  function page(children: Block[]): string {
    const id = crypto.randomUUID();
    pages.set(id, children);
    return id;
  }

  function templatePage(source: FakeDataSource): string {
    const later = dataSource({ title: ["Архив"] });
    return page([paragraphBlock(), childDatabaseBlock(source), childDatabaseBlock(later)]);
  }

  return {
    dataSource,
    dataSourceById: (id) => dataSources.get(id),
    property,
    hideDatabase: (source) => {
      hiddenDatabaseIds.add(source.databaseId);
    },
    splitSearch: (...searchPages) => {
      searchPageAt = (index) => pageOf(searchPages, index);
    },
    searchEndlessly: () => {
      searchPageAt = (index) => ({
        results: [dataSource({ title: [`База ${index + 1}`] })],
        hasMore: true,
      });
    },
    templatePage,
    pageWithoutDatabases: () => page([paragraphBlock()]),
    searchRequests: () => external.calls({ method: "POST", url: SEARCH_URL }),
    databaseReads: () => external.calls({ method: "GET", url: DATABASE_PATTERN }),
    dataSourceReads: (source) =>
      external.calls({ method: "GET", url: `${NOTION_V1}/data_sources/${source.id}` }),
    schemaUpdates: (source) =>
      external.calls({ method: "PATCH", url: `${NOTION_V1}/data_sources/${source.id}` }),
    queries: (source) =>
      external.calls({
        method: "POST",
        url: source ? `${NOTION_V1}/data_sources/${source.id}/query` : QUERY_PATTERN,
      }),
  };
}

export function isDataSourceQuery(call: ExternalCall): boolean {
  return call.method === "POST" && QUERY_PATTERN.test(call.url);
}

function pageOf(searchPages: FakeDataSource[][], index: number): SearchPage {
  return { results: searchPages[index] ?? [], hasMore: index < searchPages.length - 1 };
}

function pageIndexOf(cursor: unknown): number {
  return typeof cursor === "string" ? Number(cursor.slice(CURSOR_PREFIX.length)) : 0;
}

function searchJson(searchPage: SearchPage, index: number): Record<string, unknown> {
  return {
    ...listJson(searchPage.results.map(dataSourceJson), "page_or_data_source"),
    next_cursor: searchPage.hasMore ? `${CURSOR_PREFIX}${index + 1}` : null,
    has_more: searchPage.hasMore,
  };
}

function listJson(results: unknown[], type: string): Record<string, unknown> {
  return { object: "list", results, next_cursor: null, has_more: false, type, [type]: {} };
}

function dataSourceJson(source: FakeDataSource): Record<string, unknown> {
  return {
    object: "data_source",
    id: source.id,
    title: source.title.map(richText),
    description: [],
    icon: source.icon,
    parent: { type: "database_id", database_id: source.databaseId },
    properties: Object.fromEntries(
      source.properties.map((item) => [item.name, propertyJson(item)]),
    ),
    archived: false,
    in_trash: false,
  };
}

function propertyJson(property: FakeProperty): Record<string, unknown> {
  const { id, name, type } = property;
  return { id, name, type, [type]: propertyConfigJson(property) };
}

function propertyConfigJson({
  type,
  options = [],
  groups = [],
}: FakeProperty): Record<string, unknown> {
  if (type === "status") return { options: options.map(optionJson), groups: groups.map(groupJson) };
  return OPTION_TYPES.has(type) ? { options: options.map(optionJson) } : {};
}

function optionJson({ id, name, color }: FakeOption): Record<string, unknown> {
  return { id, name, color, description: null };
}

function groupJson({ id, name, optionIds }: FakeStatusGroup): Record<string, unknown> {
  return { id, name, color: "default", option_ids: optionIds };
}

function databaseJson(id: string, sources: FakeDataSource[]): Record<string, unknown> {
  return {
    object: "database",
    id,
    title: sources[0]?.databaseTitle.map(richText) ?? [],
    is_inline: true,
    data_sources: sources.map((source) => ({ id: source.id, name: source.title.join("") })),
  };
}

function blockJson({ id, type, content }: Block): Record<string, unknown> {
  return { object: "block", id, type, [type]: content, has_children: false };
}

function paragraphBlock(): Block {
  return { id: crypto.randomUUID(), type: "paragraph", content: { rich_text: [] } };
}

function childDatabaseBlock(source: FakeDataSource): Block {
  return {
    id: source.databaseId,
    type: "child_database",
    content: { title: source.title.join("") },
  };
}

function richText(text: string): Record<string, unknown> {
  return { type: "text", text: { content: text, link: null }, plain_text: text, href: null };
}

function propertySpecsOf(properties: unknown): PropertySpec[] {
  if (!isRecord(properties)) return [];
  return Object.entries(properties).map(([name, config]) => ({
    name,
    type: Object.keys(isRecord(config) ? config : {})[0] ?? "",
  }));
}

export function resourcePattern(collection: string, suffix = ""): RegExp {
  return new RegExp(`^${escapeRegExp(NOTION_V1)}/${collection}/[^/?]+${suffix}(\\?.*)?$`);
}

export function resourceId(request: Request): string {
  return new URL(request.url).pathname.split("/")[3] ?? "";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const parsed: unknown = await request.json();
  return isRecord(parsed) ? parsed : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function notFound(): Response {
  return Response.json(
    { object: "error", status: 404, code: "object_not_found", message: "Could not find object" },
    { status: 404 },
  );
}
