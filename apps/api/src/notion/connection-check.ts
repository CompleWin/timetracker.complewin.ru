import type { NotionConnection, NotionConnectionStatus } from "@stt/shared";
import { database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { notionUnavailable } from "../http/errors.ts";
import { notionClient, NotionReauthRequired, type NotionClient } from "./client.ts";
import { requireConnection, setConnectionStatus, toNotionConnection } from "./connections.ts";
import { NotionUnavailable, type NotionApiRequest } from "./http.ts";

const USERS_ME: NotionApiRequest = { method: "GET", path: "/v1/users/me" };

export async function checkConnection(env: Bindings, userId: string): Promise<NotionConnection> {
  const db = database(env);
  const connection = await requireConnection(db, userId);
  const status = await accessStatus(notionClient(env, connection));
  return toNotionConnection(await setConnectionStatus(db, connection.id, status));
}

async function accessStatus(client: NotionClient): Promise<NotionConnectionStatus> {
  try {
    const response = await client.request(USERS_ME);
    if (!response.ok) throw new NotionUnavailable(`Notion users/me answered ${response.status}`);
    return "ok";
  } catch (error) {
    if (error instanceof NotionReauthRequired) return "needs_reauth";
    if (error instanceof NotionUnavailable) throw notionUnavailable();
    throw error;
  }
}
