import { z } from "zod";
import type { Bindings } from "../env.ts";
import { callNotion, clientAuthorization, notionUrl } from "./http.ts";

const AUTHORIZE_PATH = "/v1/oauth/authorize";
const TOKEN_PATH = "/v1/oauth/token";
const CALLBACK_PATH = "/notion/oauth/callback";

const tokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().nullish(),
});

const grantSchema = tokensSchema.extend({
  bot_id: z.string().nullish(),
  workspace_id: z.string(),
  workspace_name: z.string().nullish(),
  workspace_icon: z.string().nullish(),
  duplicated_template_id: z.string().nullish(),
});

export type NotionTokens = {
  accessToken: string;
  refreshToken: string | null;
};

export type NotionWorkspace = {
  id: string;
  name: string;
  icon: string | null;
};

export type NotionGrant = {
  tokens: NotionTokens;
  workspace: NotionWorkspace;
  botId: string | null;
  duplicatedTemplateId: string | null;
};

export function authorizationUrl(env: Bindings, state: string): string {
  const url = new URL(notionUrl(env, AUTHORIZE_PATH));
  url.search = new URLSearchParams({
    client_id: env.NOTION_CLIENT_ID,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri(env),
    state,
  }).toString();
  return url.toString();
}

export async function exchangeCode(env: Bindings, code: string): Promise<NotionGrant> {
  const response = await requestTokens(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(env),
  });
  if (!response.ok) throw new Error(`Notion token endpoint answered ${response.status}`);
  return toGrant(grantSchema.parse(await response.json()));
}

export async function renewTokens(
  env: Bindings,
  refreshToken: string | null,
): Promise<NotionTokens | undefined> {
  if (refreshToken === null) return undefined;
  const response = await requestTokens(env, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!response.ok) return undefined;
  const renewed = tokensSchema.safeParse(await response.json());
  if (!renewed.success) return undefined;
  return {
    accessToken: renewed.data.access_token,
    refreshToken: renewed.data.refresh_token ?? refreshToken,
  };
}

function requestTokens(env: Bindings, body: Record<string, string>): Promise<Response> {
  return callNotion(env, {
    method: "POST",
    path: TOKEN_PATH,
    body,
    authorization: clientAuthorization(env),
  });
}

function redirectUri(env: Bindings): string {
  return `${env.APP_URL}${CALLBACK_PATH}`;
}

function toGrant(grant: z.infer<typeof grantSchema>): NotionGrant {
  return {
    tokens: { accessToken: grant.access_token, refreshToken: grant.refresh_token ?? null },
    workspace: {
      id: grant.workspace_id,
      name: grant.workspace_name ?? "",
      icon: grant.workspace_icon ?? null,
    },
    botId: grant.bot_id ?? null,
    duplicatedTemplateId: grant.duplicated_template_id ?? null,
  };
}
