import type { z } from "zod";
import { notionReauthRequired, notionUnavailable } from "../http/errors.ts";
import { NotionReauthRequired, type NotionClient } from "./client.ts";
import { NotionUnavailable, type NotionApiRequest } from "./http.ts";

const NOT_FOUND = 404;

export async function requestNotionJson<Schema extends z.ZodType>(
  client: NotionClient,
  request: NotionApiRequest,
  schema: Schema,
): Promise<z.output<Schema> | undefined> {
  const response = await send(client, request);
  if (response.status === NOT_FOUND) return undefined;
  if (!response.ok) throw notionUnavailable();
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw notionUnavailable();
  return parsed.data;
}

async function send(client: NotionClient, request: NotionApiRequest): Promise<Response> {
  try {
    return await client.request(request);
  } catch (error) {
    if (error instanceof NotionReauthRequired) throw notionReauthRequired();
    if (error instanceof NotionUnavailable) throw notionUnavailable();
    throw error;
  }
}
