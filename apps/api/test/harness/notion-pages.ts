import { external, type ExternalCall } from "./external.ts";
import {
  NOTION_V1,
  isRecord,
  notFound,
  readJson,
  resourceId,
  resourcePattern,
  type FakeNotionWorkspace,
  type FakeProperty,
} from "./notion-workspace.ts";

export type PageValue = Record<string, unknown>;

export type FakePage = {
  id: string;
  url: string;
  dataSourceId: string;
  values: Map<string, PageValue>;
  inTrash: boolean;
};

export type NotionFailure = {
  status: number;
  code: string;
  message?: string;
  retryAfterSec?: number;
};

export type FakeNotionPages = {
  list(): FakePage[];
  last(): FakePage;
  byUrl(url: string | null): FakePage;
  setMultiSelect(page: FakePage, property: FakeProperty, names: string[]): void;
  trash(page: FakePage): void;
  remove(page: FakePage): void;
  failWrites(failure: NotionFailure, times?: number): void;
  creations(): ExternalCall[];
  updates(page?: FakePage): ExternalCall[];
};

export const notionFailures = {
  rateLimited: (retryAfterSec: number): NotionFailure => ({
    status: 429,
    code: "rate_limited",
    retryAfterSec,
  }),
  serverError: { status: 500, code: "internal_server_error" },
  unauthorized: { status: 401, code: "unauthorized" },
  invalidTitle: {
    status: 400,
    code: "validation_error",
    message: "body failed validation: title text content is longer than 2000 characters.",
  },
} satisfies Record<string, NotionFailure | ((retryAfterSec: number) => NotionFailure)>;

const PAGES_URL = `${NOTION_V1}/pages`;
const PAGE_PATTERN = resourcePattern("pages");
const PAGE_HOST = "https://www.notion.so";
const ARCHIVED_PAGE: NotionFailure = {
  status: 400,
  code: "validation_error",
  message: "Can't edit block that is archived. You must unarchive the block before editing.",
};

export function fakeNotionPages(workspace: FakeNotionWorkspace): FakeNotionPages {
  const pages = new Map<string, FakePage>();
  const failures: NotionFailure[] = [];

  external.on("POST", PAGES_URL, async (request) => {
    const failure = failures.shift();
    if (failure) return failureResponse(failure);
    const body = await readJson(request);
    const page = createPage(dataSourceIdOf(body.parent));
    writeValues(page, body.properties);
    return Response.json(pageJson(page));
  });

  external.on("PATCH", PAGE_PATTERN, async (request) => {
    const failure = failures.shift();
    if (failure) return failureResponse(failure);
    const page = pages.get(resourceId(request));
    if (!page) return notFound();
    if (page.inTrash) return failureResponse(ARCHIVED_PAGE);
    writeValues(page, (await readJson(request)).properties);
    return Response.json(pageJson(page));
  });

  external.on("GET", PAGE_PATTERN, (request) => {
    const page = pages.get(resourceId(request));
    return page ? Response.json(pageJson(page)) : notFound();
  });

  function createPage(dataSourceId: string): FakePage {
    const id = crypto.randomUUID();
    const page: FakePage = {
      id,
      url: `${PAGE_HOST}/${id.replaceAll("-", "")}`,
      dataSourceId,
      values: new Map(),
      inTrash: false,
    };
    pages.set(id, page);
    return page;
  }

  function pageJson(page: FakePage): Record<string, unknown> {
    return {
      object: "page",
      id: page.id,
      url: page.url,
      parent: { type: "data_source_id", data_source_id: page.dataSourceId },
      in_trash: page.inTrash,
      archived: page.inTrash,
      properties: Object.fromEntries(
        [...page.values].map(([propertyId, value]) => propertyJson(page, propertyId, value)),
      ),
    };
  }

  function propertyJson(
    page: FakePage,
    propertyId: string,
    value: PageValue,
  ): [string, Record<string, unknown>] {
    const source = workspace.dataSourceById(page.dataSourceId);
    const property = source?.properties.find((candidate) => candidate.id === propertyId);
    const type = property?.type ?? Object.keys(value)[0] ?? "";
    return [property?.name ?? propertyId, { id: propertyId, type, ...value }];
  }

  function byUrl(url: string | null): FakePage {
    const found = [...pages.values()].find((page) => page.url === url);
    if (!found) throw new Error(`Notion has no page ${url}`);
    return found;
  }

  function last(): FakePage {
    const found = [...pages.values()].at(-1);
    if (!found) throw new Error("Notion has no pages");
    return found;
  }

  return {
    list: () => [...pages.values()],
    last,
    byUrl,
    setMultiSelect: (page, property, names) => {
      page.values.set(property.id, { multi_select: names.map(selectOption) });
    },
    trash: (page) => {
      page.inTrash = true;
    },
    remove: (page) => {
      pages.delete(page.id);
    },
    failWrites: (failure, times = 1) => {
      failures.push(...Array.from({ length: times }, () => failure));
    },
    creations: () => external.calls({ method: "POST", url: PAGES_URL }),
    updates: (page) =>
      external.calls({ method: "PATCH", url: page ? `${PAGES_URL}/${page.id}` : PAGE_PATTERN }),
  };
}

function writeValues(page: FakePage, properties: unknown): void {
  if (!isRecord(properties)) return;
  for (const [propertyId, value] of Object.entries(properties)) {
    if (isRecord(value)) page.values.set(propertyId, value);
  }
}

function dataSourceIdOf(parent: unknown): string {
  return isRecord(parent) && typeof parent.data_source_id === "string" ? parent.data_source_id : "";
}

function selectOption(name: string): Record<string, unknown> {
  return { id: crypto.randomUUID(), name, color: "default" };
}

function failureResponse({ status, code, message, retryAfterSec }: NotionFailure): Response {
  const headers: Record<string, string> =
    retryAfterSec === undefined ? {} : { "Retry-After": String(retryAfterSec) };
  return Response.json(
    { object: "error", status, code, message: message ?? code },
    { status, headers },
  );
}
