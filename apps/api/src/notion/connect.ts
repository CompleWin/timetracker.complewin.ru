import { database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { consumeConnectState, createConnectState } from "./connect-states.ts";
import { saveConnection } from "./connections.ts";
import { authorizationUrl, exchangeCode, type NotionGrant } from "./oauth.ts";

export type ConnectError = "cancelled" | "state" | "token";

export type ConnectOutcome = "connected" | ConnectError;

export type ConnectCallback = {
  query: { code?: string; state?: string; error?: string };
  userId: string | undefined;
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
  { query, userId, now }: ConnectCallback,
): Promise<ConnectOutcome> {
  const db = database(env);
  const stateAccepted =
    userId !== undefined &&
    query.state !== undefined &&
    (await consumeConnectState(db, query.state, userId, now));
  if (query.error !== undefined) return "cancelled";
  if (!stateAccepted) return "state";
  const grant = query.code ? await requestGrant(env, query.code) : undefined;
  if (grant === undefined) return "token";
  await saveConnection(db, env.TOKEN_ENC_KEY, userId, grant, now);
  return "connected";
}

async function requestGrant(env: Bindings, code: string): Promise<NotionGrant | undefined> {
  try {
    return await exchangeCode(env, code);
  } catch (error) {
    console.warn("Notion code exchange failed:", String(error));
    return undefined;
  }
}
