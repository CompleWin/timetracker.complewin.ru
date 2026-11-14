import { api, type TestResponse } from "./api.ts";
import { atMinute } from "./clock.ts";
import { external, type ExternalCall } from "./external.ts";
import {
  failureResponse,
  type FakeNotionPages,
  type FakePage,
  type NotionFailure,
} from "./notion-pages.ts";
import { addDatabase, type DatabaseSettings } from "./notion-databases.ts";
import { userWithDatabase, type FakeNotionPull, type UserWithDatabase } from "./notion-pull.ts";
import {
  SETUP_TIME,
  TASKS_DATABASE,
  cronAt,
  type DatabaseSetup,
  type FakeNotionSync,
} from "./notion-sync.ts";
import { userWithTaskPage, type UserWithTaskPage } from "./notion-task-pages.ts";
import { notFound, resourcePattern, type FakeDataSource } from "./notion-workspace.ts";
import { notionWorkspace, type NotionGrant } from "./notion.ts";
import { loginAs } from "./session.ts";
import { testEnv } from "./test-env.ts";

export type NotionRef = {
  id: string;
  type: string;
};

export type WebhookAuthor = {
  id: string;
  type: "person" | "bot" | "agent";
};

export type NotionWebhookEvent = {
  id: string;
  timestamp: string;
  workspace_id: string;
  subscription_id: string;
  integration_id: string;
  type: string;
  authors: WebhookAuthor[];
  accessible_by?: NotionRef[];
  attempt_number: number;
  entity: NotionRef;
  data: { parent: NotionRef };
};

export type PageEventInput = {
  type?: string;
  parent?: NotionRef;
  workspaceId?: string;
  authors?: WebhookAuthor[];
  accessibleBy?: NotionRef[];
  timestamp?: string;
};

export type WebhookUser = UserWithDatabase & {
  grant: NotionGrant;
};

export type WebhookTaskUser = UserWithTaskPage & {
  grant: NotionGrant;
};

export type FakePageReads = {
  fail(failure: NotionFailure, times?: number): void;
};

export const NOTION_WEBHOOK_PATH = "/notion/webhook";
export const SIGNATURE_HEADER = "X-Notion-Signature";
export const SUBSCRIBED_EVENT_TYPES = [
  "page.created",
  "page.properties_updated",
  "page.moved",
  "page.deleted",
  "page.undeleted",
] as const;
export const PERSON: WebhookAuthor = { id: "a11ce000-0000-4000-8000-000000000001", type: "person" };
export const OK_REPLY = { status: 200, body: { ok: true } };

const PAGE_PATTERN = resourcePattern("pages");
const SUBSCRIPTION_ID = "5b5c0000-0000-4000-8000-000000000001";
const INTEGRATION_ID = "1a7e9000-0000-4000-8000-000000000001";
const EVENT_TIMESTAMP = "2030-01-01T00:00:00.000Z";
const COLLEAGUE_TELEGRAM_ID = 7_700_000_002;
const COLLEAGUE_BASE: DatabaseSettings = {
  projectMode: "none",
  blockPosition: "none",
  timeProperties: true,
};

export function fakePageReads(pages: FakeNotionPages): FakePageReads {
  const failures: NotionFailure[] = [];

  external.on("GET", PAGE_PATTERN, (request) => {
    const failure = failures.shift();
    if (failure) return failureResponse(failure);
    const requestedId = pageIdOf(request.url);
    const page = pages.list().find((candidate) => sameNotionId(candidate.id, requestedId));
    return page ? Response.json(pages.json(page)) : notFound();
  });

  return {
    fail: (failure, times = 1) => {
      failures.push(...Array.from({ length: times }, () => failure));
    },
  };
}

export async function webhookUser(
  fake: FakeNotionSync,
  database: DatabaseSetup = TASKS_DATABASE,
): Promise<WebhookUser> {
  const user = await userWithDatabase(fake, database);
  return { ...user, grant: fake.notion.latestGrant() };
}

export async function webhookTaskUser(
  fake: FakeNotionSync,
  database: DatabaseSetup = TASKS_DATABASE,
): Promise<WebhookTaskUser> {
  const user = await userWithTaskPage(fake, database);
  return { ...user, grant: fake.notion.latestGrant() };
}

export async function colleagueWithBase(
  fake: FakeNotionSync,
  dataSource: FakeDataSource,
): Promise<WebhookUser> {
  const { session } = await loginAs(
    { telegramId: COLLEAGUE_TELEGRAM_ID, locale: "ru" },
    SETUP_TIME,
  );
  const grant = await fake.notion.connect(session, notionWorkspace, SETUP_TIME);
  const database = await addDatabase(session, dataSource, COLLEAGUE_BASE, SETUP_TIME);
  return { session, grant, added: { database, dataSource } };
}

export function botOf(grant: NotionGrant): WebhookAuthor & NotionRef {
  return { id: grant.botId, type: "bot" };
}

export function databaseParent(dataSource: FakeDataSource): NotionRef {
  return { id: dataSource.databaseId, type: "database" };
}

export function dataSourceParent(dataSource: FakeDataSource): NotionRef {
  return { id: dataSource.id, type: "data_source" };
}

export function compactUpperId(id: string): string {
  return id.replaceAll("-", "").toUpperCase();
}

export function pageEvent(
  pageId: string,
  {
    type = "page.properties_updated",
    parent = { id: crypto.randomUUID(), type: "database" },
    workspaceId = notionWorkspace.id,
    authors = [PERSON],
    accessibleBy,
    timestamp = EVENT_TIMESTAMP,
  }: PageEventInput = {},
): NotionWebhookEvent {
  return {
    id: crypto.randomUUID(),
    timestamp,
    workspace_id: workspaceId,
    subscription_id: SUBSCRIPTION_ID,
    integration_id: INTEGRATION_ID,
    type,
    authors,
    ...(accessibleBy === undefined ? {} : { accessible_by: accessibleBy }),
    attempt_number: 1,
    entity: { id: pageId, type: "page" },
    data: { parent },
  };
}

export function eventAbout(
  page: FakePage,
  dataSource: FakeDataSource,
  input: PageEventInput = {},
): NotionWebhookEvent {
  return pageEvent(page.id, { parent: databaseParent(dataSource), ...input });
}

export function unrelatedEvent(input: PageEventInput = {}): NotionWebhookEvent {
  return pageEvent(crypto.randomUUID(), input);
}

export async function notionSignature(
  body: string,
  secret: string = testEnv.NOTION_WEBHOOK_SECRET,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `sha256=${hexOf(mac)}`;
}

export function postToWebhook(
  body: string,
  time: { now: string },
  headers: Record<string, string> = {},
): Promise<TestResponse> {
  return api.post(NOTION_WEBHOOK_PATH, body, { ...time, headers });
}

export async function sendSigned(body: string, time: { now: string }): Promise<TestResponse> {
  return postToWebhook(body, time, { [SIGNATURE_HEADER]: await notionSignature(body) });
}

export function sendEvent(event: unknown, time: { now: string }): Promise<TestResponse> {
  return sendSigned(JSON.stringify(event), time);
}

export function isPageRead(call: ExternalCall): boolean {
  return call.method === "GET" && PAGE_PATTERN.test(call.url);
}

export function readsOfPage(calls: ExternalCall[], page: FakePage): ExternalCall[] {
  return calls.filter((call) => isPageRead(call) && sameNotionId(pageIdOf(call.url), page.id));
}

export function bearerOf(call: ExternalCall): string {
  return call.headers.authorization ?? "";
}

export async function queriesPerCron(fake: FakeNotionPull, minutes: number[]): Promise<number[]> {
  const counts: number[] = [];
  for (const minute of minutes) {
    counts.push((await fake.queriesDuring(() => cronAt(atMinute(minute)))).length);
  }
  return counts;
}

function sameNotionId(left: string, right: string): boolean {
  return compactUpperId(left) === compactUpperId(right);
}

function pageIdOf(url: string): string {
  return new URL(url).pathname.split("/")[3] ?? "";
}

function hexOf(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
