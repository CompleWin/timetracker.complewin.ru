import { database, type Database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { consumeConnectState, createConnectState } from "./connect-states.ts";
import { findWorkspaceId, saveConnection } from "./connections.ts";
import { databaseSetup, type DatabaseOwner } from "./database-setup.ts";
import { removeAllNotionDatabases } from "./databases.ts";
import { authorizationUrl, exchangeCode, type NotionGrant } from "./oauth.ts";
import { addTemplateDatabase } from "./template.ts";

export type ConnectError = "cancelled" | "state" | "token";

export type ConnectOutcome = "connected" | ConnectError;

export type ConnectCallback = {
  query: { code?: string; state?: string; error?: string };
  user: DatabaseOwner | undefined;
  now: Date;
};

export async function beginNotionConnect(
  env: Bindings,
  userId: string,
  now: Date,
): Promise<string> {
  const state = await createConnectState(database(env), userId, now);
  return authorizationUrl(env, state);
}

export async function completeNotionConnect(
  env: Bindings,
  { query, user, now }: ConnectCallback,
): Promise<ConnectOutcome> {
  const db = database(env);
  const stateAccepted =
    user !== undefined &&
    query.state !== undefined &&
    (await consumeConnectState(db, query.state, user.id, now));
  if (query.error !== undefined) return "cancelled";
  if (!stateAccepted) return "state";
  const grant = query.code ? await requestGrant(env, query.code) : undefined;
  if (grant === undefined) return "token";
  await forgetOtherWorkspace(db, user.id, grant);
  const connection = await saveConnection(db, env.TOKEN_ENC_KEY, user.id, grant, now);
  if (grant.duplicatedTemplateId !== null) {
    const setup = databaseSetup(env, connection, user, now);
    await addTemplateDatabase(setup, grant.duplicatedTemplateId);
  }
  return "connected";
}

async function forgetOtherWorkspace(
  db: Database,
  userId: string,
  grant: NotionGrant,
): Promise<void> {
  const previous = await findWorkspaceId(db, userId);
  if (previous !== undefined && previous !== grant.workspace.id) {
    await removeAllNotionDatabases(db, userId);
  }
}

async function requestGrant(env: Bindings, code: string): Promise<NotionGrant | undefined> {
  try {
    return await exchangeCode(env, code);
  } catch (error) {
    console.warn("Notion code exchange failed:", String(error));
    return undefined;
  }
}
