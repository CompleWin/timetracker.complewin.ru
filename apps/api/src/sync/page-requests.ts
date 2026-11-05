import { z } from "zod";
import type { NotionClient } from "../notion/client.ts";
import { NotionUnavailable, type NotionApiRequest } from "../notion/http.ts";
import { pagePath } from "../notion/pages.ts";
import type { PageProperties } from "./page-state.ts";

const TOO_MANY_REQUESTS = 429;
const OVERLOADED = 529;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const DEFAULT_RETRY_AFTER_SEC = 60;
const MISSING_PROPERTY = /could not find property|is not a property that exists/i;

export type RequestBudget = {
  remaining: number;
};

export type PageReply = {
  status: number;
  body: unknown;
};

export type CreatedPage = {
  id: string;
  url: string;
};

export class BudgetExhausted extends Error {
  constructor() {
    super("Notion request budget of this run is exhausted");
  }
}

export class RateLimited extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`Notion asked to retry after ${retryAfterSec} s`);
  }
}

export class ServerFailure extends Error {}

export class PageRejected extends Error {}

export class PageGone extends Error {
  constructor() {
    super("Notion page was not found");
  }
}

const errorSchema = z.object({ message: z.string().min(1) });

const createdPageSchema = z.object({ id: z.string(), url: z.string() });

const pageSchema = z.object({
  in_trash: z.boolean().optional(),
  properties: z.record(
    z.string(),
    z.looseObject({
      id: z.string(),
      multi_select: z.array(z.object({ name: z.string() })).optional(),
    }),
  ),
});

type Page = z.infer<typeof pageSchema>;

export function budgetedClient(
  client: NotionClient,
  budget: RequestBudget,
  pauseMs: number,
): NotionClient {
  let sent = 0;
  async function request(apiRequest: NotionApiRequest): Promise<Response> {
    if (budget.remaining <= 0) throw new BudgetExhausted();
    budget.remaining -= 1;
    if (sent > 0 && pauseMs > 0) await pause(pauseMs);
    sent += 1;
    return client.request(apiRequest);
  }
  return { request };
}

export function createPage(
  client: NotionClient,
  dataSourceId: string,
  properties: PageProperties,
): Promise<PageReply> {
  const parent = { type: "data_source_id", data_source_id: dataSourceId };
  return sendRequest(client, { method: "POST", path: "/v1/pages", body: { parent, properties } });
}

export function updatePage(
  client: NotionClient,
  pageId: string,
  properties: PageProperties,
): Promise<PageReply> {
  return sendRequest(client, { method: "PATCH", path: pagePath(pageId), body: { properties } });
}

export async function retrievePage(client: NotionClient, pageId: string): Promise<Page> {
  const reply = await sendRequest(client, { method: "GET", path: pagePath(pageId) });
  if (reply.status === NOT_FOUND) throw new PageGone();
  ensureAccepted(reply);
  const page = pageSchema.safeParse(reply.body);
  if (!page.success) throw new ServerFailure("Notion returned an unexpected page");
  return page.data;
}

export function multiSelectNames(page: Page, propertyId: string): string[] {
  const property = Object.values(page.properties).find(({ id }) => id === propertyId);
  return property?.multi_select?.map(({ name }) => name) ?? [];
}

export function createdPage(reply: PageReply): CreatedPage {
  ensureAccepted(reply);
  const page = createdPageSchema.safeParse(reply.body);
  if (!page.success) throw new ServerFailure("Notion returned an unexpected page");
  return page.data;
}

export function ensureAccepted(reply: PageReply): void {
  if (reply.status < 200 || reply.status >= 300) throw new PageRejected(errorMessage(reply));
}

export function isBadRequest(reply: PageReply): boolean {
  return reply.status === BAD_REQUEST;
}

export function isNotFound(reply: PageReply): boolean {
  return reply.status === NOT_FOUND;
}

export function isMissingProperty(reply: PageReply): boolean {
  return isBadRequest(reply) && MISSING_PROPERTY.test(errorMessage(reply));
}

export async function sendRequest(
  client: NotionClient,
  request: NotionApiRequest,
): Promise<PageReply> {
  const response = await sendOrRateLimit(client, request);
  if (response.status === TOO_MANY_REQUESTS) throw rateLimited(response);
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

async function sendOrRateLimit(client: NotionClient, request: NotionApiRequest) {
  try {
    return await client.request(request);
  } catch (error) {
    if (!(error instanceof NotionUnavailable)) throw error;
    if (error.response?.status === OVERLOADED) throw rateLimited(error.response);
    throw new ServerFailure(error.message);
  }
}

function rateLimited(response: Response): RateLimited {
  const retryAfter = Number(response.headers.get("Retry-After"));
  return new RateLimited(
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : DEFAULT_RETRY_AFTER_SEC,
  );
}

function errorMessage(reply: PageReply): string {
  const parsed = errorSchema.safeParse(reply.body);
  return parsed.success ? parsed.data.message : `Notion answered ${reply.status}`;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
