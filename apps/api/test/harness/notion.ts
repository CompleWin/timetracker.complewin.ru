import { expect } from "vitest";
import { api, type Opts, type TestResponse, type TestSession } from "./api.ts";
import { external, type ExternalCall } from "./external.ts";
import { expectRedirect, redirectTarget } from "./redirect.ts";
import type { SessionOpts } from "./rest.ts";
import { loginAs, type LoginAsInput } from "./session.ts";
import { testEnv } from "./test-env.ts";

export type NotionWorkspace = {
  id: string;
  name: string;
  icon: string | null;
};

export type NotionGrant = {
  accessToken: string;
  refreshToken: string;
  botId: string;
  workspace: NotionWorkspace;
};

export type GrantReply = {
  workspace?: NotionWorkspace;
  errorStatus?: number;
};

export type NotionAttempt = {
  authorizationUrl: URL;
  state: string;
  code: string;
};

export type UsersMeFailure = number | "network";

export type ConnectError = "cancelled" | "state" | "token";

export type TestNotionConnection = {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string | null;
  status: "ok" | "needs_reauth";
  databases: unknown[];
  createdAt: string;
};

export type FakeNotion = {
  start(opts?: Opts): Promise<NotionAttempt>;
  callback(attempt: NotionAttempt, opts?: Opts, reply?: GrantReply): Promise<TestResponse>;
  cancel(attempt: NotionAttempt, opts?: Opts): Promise<TestResponse>;
  connect(
    session: TestSession,
    workspace?: NotionWorkspace,
    opts?: SessionOpts,
  ): Promise<NotionGrant>;
  expireAccessTokens(): void;
  rejectRefresh(): void;
  failUsersMe(failure: UsersMeFailure): void;
  grants(): NotionGrant[];
  latestGrant(): NotionGrant;
  requests(): ExternalCall[];
  tokenRequests(): ExternalCall[];
  refreshRequests(): ExternalCall[];
  usersMeRequests(): ExternalCall[];
};

export type NotionUser = {
  session: TestSession;
  grant: NotionGrant;
};

export const NOTION_VERSION = "2026-03-11";
export const NOTION_START_PATH = "/notion/oauth/start";
export const NOTION_CALLBACK_PATH = "/notion/oauth/callback";
export const NOTION_CALLBACK_URL = `${testEnv.APP_URL}${NOTION_CALLBACK_PATH}`;
export const NOTION_CLIENT_AUTH = `Basic ${btoa(`${testEnv.NOTION_CLIENT_ID}:${testEnv.NOTION_CLIENT_SECRET}`)}`;

export const notionEndpoints = {
  authorize: `${testEnv.NOTION_API_BASE}/v1/oauth/authorize`,
  token: `${testEnv.NOTION_API_BASE}/v1/oauth/token`,
  usersMe: `${testEnv.NOTION_API_BASE}/v1/users/me`,
} as const;

export const notionWorkspace: NotionWorkspace = {
  id: "5c1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6",
  name: "Acme Workspace",
  icon: "https://www.notion.so/images/acme-icon.png",
};

export const otherNotionWorkspace: NotionWorkspace = {
  id: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d",
  name: "Side Project",
  icon: null,
};

const CONNECTION_PATH = "/api/notion/connection";
const CHECK_PATH = `${CONNECTION_PATH}/check`;
const CONNECTED_TARGET = "/settings?notion=connected";
const BOT_USER = {
  object: "user",
  id: "b0b0b0b0-0000-4000-8000-000000000001",
  type: "bot",
  bot: {},
};

export function fakeNotion(): FakeNotion {
  const pendingReplies = new Map<string, GrantReply>();
  const grantsByCode = new Map<string, NotionGrant>();
  const issuedGrants: NotionGrant[] = [];
  const liveAccessTokens = new Set<string>();
  const liveRefreshTokens = new Map<string, NotionGrant>();
  let refreshRejected = false;
  let usersMeFailure: UsersMeFailure | undefined;

  external.on("POST", notionEndpoints.token, async (request) => {
    const body = jsonFields(await request.text());
    if (body.grant_type === "authorization_code") return exchangeCode(String(body.code));
    if (body.grant_type === "refresh_token") return refreshGrant(String(body.refresh_token));
    return oauthError(400);
  });

  external.on("GET", notionEndpoints.usersMe, (request) => {
    if (usersMeFailure === "network") throw new TypeError("Network connection lost");
    if (usersMeFailure !== undefined) return apiError(usersMeFailure, "internal_server_error");
    if (!liveAccessTokens.has(bearerToken(request))) return apiError(401, "unauthorized");
    return Response.json(BOT_USER);
  });

  function activate(grant: NotionGrant): NotionGrant {
    issuedGrants.push(grant);
    liveAccessTokens.add(grant.accessToken);
    liveRefreshTokens.set(grant.refreshToken, grant);
    return grant;
  }

  function exchangeCode(code: string): Response {
    const reply = pendingReplies.get(code);
    if (reply === undefined) return oauthError(400);
    if (reply.errorStatus !== undefined) return oauthError(reply.errorStatus);
    const workspace = reply.workspace ?? notionWorkspace;
    const grant = activate({ ...freshTokens(), botId: crypto.randomUUID(), workspace });
    grantsByCode.set(code, grant);
    return grantResponse(grant);
  }

  function refreshGrant(refreshToken: string): Response {
    const grant = liveRefreshTokens.get(refreshToken);
    if (refreshRejected || grant === undefined) return oauthError(400);
    liveRefreshTokens.delete(refreshToken);
    liveAccessTokens.delete(grant.accessToken);
    return grantResponse(activate({ ...grant, ...freshTokens() }));
  }

  async function start(opts?: Opts): Promise<NotionAttempt> {
    const response = await api.get(NOTION_START_PATH, opts);
    const location = response.headers.get("Location");
    if (response.status !== 302 || location === null) {
      throw new Error(`GET ${NOTION_START_PATH} answered ${response.status} without redirect`);
    }
    const authorizationUrl = new URL(location, testEnv.APP_URL);
    return {
      authorizationUrl,
      state: authorizationUrl.searchParams.get("state") ?? "",
      code: crypto.randomUUID(),
    };
  }

  function callback(
    attempt: NotionAttempt,
    opts?: Opts,
    reply: GrantReply = {},
  ): Promise<TestResponse> {
    pendingReplies.set(attempt.code, reply);
    return api.get(callbackPath({ code: attempt.code, state: attempt.state }), opts);
  }

  function cancel(attempt: NotionAttempt, opts?: Opts): Promise<TestResponse> {
    return api.get(callbackPath({ error: "access_denied", state: attempt.state }), opts);
  }

  async function connect(
    session: TestSession,
    workspace: NotionWorkspace = notionWorkspace,
    opts: SessionOpts = {},
  ): Promise<NotionGrant> {
    const sessionOpts = { ...opts, as: session };
    const attempt = await start(sessionOpts);
    const response = await callback(attempt, sessionOpts, { workspace });
    const grant = grantsByCode.get(attempt.code);
    if (redirectTarget(response) !== CONNECTED_TARGET || grant === undefined) {
      throw new Error(`Notion callback answered ${response.status} ${redirectTarget(response)}`);
    }
    return grant;
  }

  function latestGrant(): NotionGrant {
    const grant = issuedGrants.at(-1);
    if (grant === undefined) throw new Error("Notion issued no tokens");
    return grant;
  }

  function tokenRequests(): ExternalCall[] {
    return external.calls({ method: "POST", url: notionEndpoints.token });
  }

  return {
    start,
    callback,
    cancel,
    connect,
    expireAccessTokens: () => liveAccessTokens.clear(),
    rejectRefresh: () => {
      refreshRejected = true;
    },
    failUsersMe: (failure) => {
      usersMeFailure = failure;
    },
    grants: () => [...issuedGrants],
    latestGrant,
    requests: () =>
      external.calls().filter((call) => call.url.startsWith(`${testEnv.NOTION_API_BASE}/`)),
    tokenRequests,
    refreshRequests: () =>
      tokenRequests().filter((call) => jsonFields(call.body).grant_type === "refresh_token"),
    usersMeRequests: () => external.calls({ method: "GET", url: notionEndpoints.usersMe }),
  };
}

export async function loginWithNotion(
  notion: FakeNotion,
  input: LoginAsInput = {},
): Promise<NotionUser> {
  const { session } = await loginAs(input);
  return { session, grant: await notion.connect(session) };
}

export function getNotionConnection(
  session: TestSession,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(CONNECTION_PATH, { ...opts, as: session });
}

export function checkNotionConnection(
  session: TestSession,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.post(CHECK_PATH, undefined, { ...opts, as: session });
}

export function disconnectNotion(
  session: TestSession,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.delete(CONNECTION_PATH, { ...opts, as: session });
}

export function expectConnection(
  response: TestResponse,
  connection: Partial<TestNotionConnection> | null,
): void {
  expect(response).toMatchObject({ status: 200, body: { connection } });
}

export function expectConnected(response: TestResponse): void {
  expectRedirect(response, CONNECTED_TARGET);
}

export function expectConnectError(response: TestResponse, error: ConnectError): void {
  expectRedirect(response, `/settings?notion_error=${error}`);
}

export function onlyCall(calls: ExternalCall[]): ExternalCall {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  if (call === undefined) throw new Error("Expected exactly one external call");
  return call;
}

export function jsonBodyOf(call: ExternalCall): unknown {
  return JSON.parse(call.body);
}

export function tokensOf(grants: NotionGrant[]): string[] {
  return grants.flatMap((grant) => [grant.accessToken, grant.refreshToken]);
}

function callbackPath(params: Record<string, string>): string {
  return `${NOTION_CALLBACK_PATH}?${new URLSearchParams(params)}`;
}

function freshTokens(): Pick<NotionGrant, "accessToken" | "refreshToken"> {
  return { accessToken: randomToken("access"), refreshToken: randomToken("refresh") };
}

function randomToken(kind: string): string {
  return `ntn_${kind}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
}

function jsonFields(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? Object.fromEntries(Object.entries(parsed))
      : {};
  } catch {
    return {};
  }
}

function grantResponse(grant: NotionGrant): Response {
  return Response.json({
    access_token: grant.accessToken,
    token_type: "bearer",
    refresh_token: grant.refreshToken,
    bot_id: grant.botId,
    workspace_id: grant.workspace.id,
    workspace_name: grant.workspace.name,
    workspace_icon: grant.workspace.icon,
    duplicated_template_id: null,
  });
}

function oauthError(status: number): Response {
  return Response.json({ error: "invalid_grant" }, { status });
}

function apiError(status: number, code: string): Response {
  return Response.json({ object: "error", status, code, message: code }, { status });
}
