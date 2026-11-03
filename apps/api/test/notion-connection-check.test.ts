import { beforeEach, describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import type { ExternalCall, TestSession } from "./harness/index.ts";
import {
  checkNotionConnection,
  expectConnection,
  fakeNotion,
  getNotionConnection,
  jsonBodyOf,
  loginWithNotion,
  NOTION_CLIENT_AUTH,
  NOTION_VERSION,
  notionEndpoints,
  notionWorkspace,
  onlyCall,
  type FakeNotion,
  type NotionGrant,
} from "./harness/notion.ts";
import { loginAs } from "./harness/session.ts";

let notion: FakeNotion;

beforeEach(() => {
  notion = fakeNotion();
});

function bearer(grant: NotionGrant): string {
  return `Bearer ${grant.accessToken}`;
}

function authorizationOf(call: ExternalCall): string | undefined {
  return call.headers.authorization;
}

function endpointOf(call: ExternalCall): string {
  const url = new URL(call.url);
  return `${url.origin}${url.pathname}`;
}

async function expectCheckStatus(
  session: TestSession,
  status: "ok" | "needs_reauth",
): Promise<void> {
  expectConnection(await checkNotionConnection(session), { status });
}

describe("POST /api/notion/connection/check", () => {
  it("6. users/me отвечает 200: статус ok, запрос идёт с Bearer access_token", async () => {
    const { session, grant } = await loginWithNotion(notion);
    const response = await checkNotionConnection(session);

    expectConnection(response, { status: "ok", workspaceName: notionWorkspace.name });
    expect(authorizationOf(onlyCall(notion.usersMeRequests()))).toBe(bearer(grant));
  });

  it("6. users/me отвечает 401, обновление успешно: повторный запрос идёт с новым токеном, статус ok", async () => {
    const { session, grant } = await loginWithNotion(notion);
    notion.expireAccessTokens();

    await expectCheckStatus(session, "ok");
    expect(notion.usersMeRequests().map(authorizationOf)).toEqual([
      bearer(grant),
      bearer(notion.latestGrant()),
    ]);
  });

  it("6. обновление токена идёт с Basic-аутентификацией клиента и телом grant_type=refresh_token", async () => {
    const { session, grant } = await loginWithNotion(notion);
    notion.expireAccessTokens();
    await checkNotionConnection(session);
    const request = onlyCall(notion.refreshRequests());

    expect(request.headers.authorization).toBe(NOTION_CLIENT_AUTH);
    expect(jsonBodyOf(request)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: grant.refreshToken,
    });
  });

  it("6. после обновления сохраняются новые токены: следующее обновление идёт с новым refresh_token", async () => {
    const { session, grant } = await loginWithNotion(notion);
    notion.expireAccessTokens();
    await expectCheckStatus(session, "ok");
    const renewed = notion.latestGrant();
    notion.expireAccessTokens();

    await expectCheckStatus(session, "ok");
    expect(notion.refreshRequests().map(jsonBodyOf)).toMatchObject([
      { refresh_token: grant.refreshToken },
      { refresh_token: renewed.refreshToken },
    ]);
  });

  it("6. обновление отвечает 400: статус needs_reauth, он сохраняется в подключении", async () => {
    const { session } = await loginWithNotion(notion);
    notion.expireAccessTokens();
    notion.rejectRefresh();

    await expectCheckStatus(session, "needs_reauth");
    expectConnection(await getNotionConnection(session), { status: "needs_reauth" });
  });

  it("6. users/me отвечает 500: 502 notion_unavailable", async () => {
    const { session } = await loginWithNotion(notion);
    notion.failUsersMe(500);

    expectApiError(await checkNotionConnection(session), "notion_unavailable");
  });

  it("6. Notion недоступен: 502 notion_unavailable", async () => {
    const { session } = await loginWithNotion(notion);
    notion.failUsersMe("network");

    expectApiError(await checkNotionConnection(session), "notion_unavailable");
  });

  it("6. без подключения отвечает 404 not_found", async () => {
    const { session } = await loginAs();

    expectApiError(await checkNotionConnection(session), "not_found");
  });
});

describe("Notion-Version", () => {
  it("7. все запросы к Notion, включая обмен кода и обновление токена, содержат Notion-Version: 2026-03-11", async () => {
    const { session } = await loginWithNotion(notion);
    notion.expireAccessTokens();
    await expectCheckStatus(session, "ok");
    const requests = notion.requests();

    expect(requests.map(endpointOf)).toEqual(
      expect.arrayContaining([notionEndpoints.token, notionEndpoints.usersMe]),
    );
    expect(requests.map((call) => call.headers["notion-version"])).toEqual(
      requests.map(() => NOTION_VERSION),
    );
  });
});
