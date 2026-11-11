import type { Bindings } from "../env.ts";

const DEFAULT_API_BASE = "https://api.notion.com";
const NOTION_VERSION = "2026-03-11";

export type NotionApiRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
};

export type NotionRequest = NotionApiRequest & {
  authorization: string;
};

export class NotionUnavailable extends Error {
  constructor(
    message: string,
    readonly response?: Response,
  ) {
    super(message);
  }
}

export function notionUrl(env: Bindings, path: string): string {
  return `${env.NOTION_API_BASE ?? DEFAULT_API_BASE}${path}`;
}

export function clientAuthorization(env: Bindings): string {
  return `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}`;
}

export async function callNotion(env: Bindings, request: NotionRequest): Promise<Response> {
  const response = await send(env, request);
  if (response.status >= 500) {
    throw new NotionUnavailable(`Notion answered ${response.status}`, response);
  }
  return response;
}

async function send(
  env: Bindings,
  { method, path, body, authorization, signal }: NotionRequest,
): Promise<Response> {
  const headers = new Headers({ Authorization: authorization, "Notion-Version": NOTION_VERSION });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  try {
    return await fetch(notionUrl(env, path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new NotionUnavailable(`Notion request failed: ${String(error)}`);
  }
}
