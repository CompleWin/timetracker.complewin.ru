import { database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { readTokens, setConnectionStatus, storeTokens, type ConnectedRow } from "./connections.ts";
import { callNotion, type NotionApiRequest } from "./http.ts";
import { renewTokens } from "./oauth.ts";
import { decryptToken } from "./token-cipher.ts";

const UNAUTHORIZED = 401;

export class NotionReauthRequired extends Error {
  constructor() {
    super("Notion connection needs to be reauthorized");
  }
}

export type NotionClient = {
  request(request: NotionApiRequest): Promise<Response>;
};

export function notionClient(
  env: Bindings,
  connection: Pick<ConnectedRow, "id" | "accessTokenEnc">,
): NotionClient {
  let accessToken = decryptToken(env.TOKEN_ENC_KEY, connection.accessTokenEnc);
  let renewal: Promise<string> | undefined;

  function renew(staleToken: string): Promise<string> {
    renewal ??= renewAccessToken(env, connection.id, staleToken).finally(() => {
      renewal = undefined;
    });
    accessToken = renewal;
    return renewal;
  }

  async function request(apiRequest: NotionApiRequest): Promise<Response> {
    const token = await accessToken;
    const response = await send(env, apiRequest, token);
    if (response.status !== UNAUTHORIZED) return response;
    const retried = await send(env, apiRequest, await renew(token));
    if (retried.status === UNAUTHORIZED) throw await reauthRequired(env, connection.id);
    return retried;
  }

  return { request };
}

function send(env: Bindings, request: NotionApiRequest, accessToken: string): Promise<Response> {
  return callNotion(env, { ...request, authorization: `Bearer ${accessToken}` });
}

async function renewAccessToken(
  env: Bindings,
  connectionId: string,
  staleToken: string,
): Promise<string> {
  const db = database(env);
  const stored = await readTokens(db, env.TOKEN_ENC_KEY, connectionId);
  if (stored === undefined) throw new NotionReauthRequired();
  if (stored.accessToken !== staleToken) return stored.accessToken;
  const renewed = await renewTokens(env, stored.refreshToken);
  if (renewed === undefined) throw await reauthRequired(env, connectionId);
  await storeTokens(db, env.TOKEN_ENC_KEY, connectionId, renewed);
  return renewed.accessToken;
}

async function reauthRequired(env: Bindings, connectionId: string): Promise<NotionReauthRequired> {
  await setConnectionStatus(database(env), connectionId, "needs_reauth");
  return new NotionReauthRequired();
}
