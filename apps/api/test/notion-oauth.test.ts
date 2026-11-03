import { beforeEach, describe, expect, it } from "vitest";
import { ISO_TIME } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import { api, testEnv, type Opts, type TestSession } from "./harness/index.ts";
import {
  expectConnected,
  expectConnectError,
  expectConnection,
  fakeNotion,
  getNotionConnection,
  jsonBodyOf,
  NOTION_CALLBACK_URL,
  NOTION_CLIENT_AUTH,
  NOTION_START_PATH,
  notionEndpoints,
  notionWorkspace,
  onlyCall,
  otherNotionWorkspace,
  type FakeNotion,
  type NotionAttempt,
} from "./harness/notion.ts";
import type { SessionOpts } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";

type StartedConnect = {
  session: TestSession;
  attempt: NotionAttempt;
};

let notion: FakeNotion;

beforeEach(() => {
  notion = fakeNotion();
});

async function startRedirect(opts?: Opts): Promise<URL> {
  const response = await api.get(NOTION_START_PATH, opts);
  expect(response.status).toBe(302);
  return new URL(response.headers.get("Location") ?? "", testEnv.APP_URL);
}

function endpointOf(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

async function loginAndStart(opts: SessionOpts = {}): Promise<StartedConnect> {
  const { session } = await loginAs({}, opts);
  return { session, attempt: await notion.start({ ...opts, as: session }) };
}

describe("GET /notion/oauth/start", () => {
  it("1. без сессии ведёт на /login?returnTo=/settings", async () => {
    const url = await startRedirect();

    expect(endpointOf(url)).toBe(`${testEnv.APP_URL}/login`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ returnTo: "/settings" });
  });

  it("1. с сессией ведёт на /v1/oauth/authorize со всеми параметрами", async () => {
    const { session } = await loginAs();
    const url = await startRedirect({ as: session });

    expect(endpointOf(url)).toBe(notionEndpoints.authorize);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: testEnv.NOTION_CLIENT_ID,
      response_type: "code",
      owner: "user",
      redirect_uri: NOTION_CALLBACK_URL,
      state: expect.stringMatching(/\S/),
    });
  });

  it("1. каждый start выдаёт новый state", async () => {
    const { session } = await loginAs();
    const first = await startRedirect({ as: session });
    const second = await startRedirect({ as: session });

    expect(second.searchParams.get("state")).not.toBe(first.searchParams.get("state"));
  });
});

describe("успешный callback", () => {
  it("2. запрос к /v1/oauth/token содержит Basic-аутентификацию из testEnv и тело с grant_type, code, redirect_uri", async () => {
    const { session, attempt } = await loginAndStart();
    await notion.callback(attempt, { as: session });
    const request = onlyCall(notion.tokenRequests());

    expect(request.headers.authorization).toBe(NOTION_CLIENT_AUTH);
    expect(jsonBodyOf(request)).toMatchObject({
      grant_type: "authorization_code",
      code: attempt.code,
      redirect_uri: NOTION_CALLBACK_URL,
    });
  });

  it("2. callback отвечает 302 /settings?notion=connected", async () => {
    const { session, attempt } = await loginAndStart();

    expectConnected(await notion.callback(attempt, { as: session }));
  });

  it("2. GET /api/notion/connection возвращает workspace из ответа token-эндпоинта и status ok", async () => {
    const { session, attempt } = await loginAndStart();
    await notion.callback(attempt, { as: session });

    expectConnection(await getNotionConnection(session), {
      workspaceId: notionWorkspace.id,
      workspaceName: notionWorkspace.name,
      workspaceIcon: notionWorkspace.icon,
      status: "ok",
      databases: [],
      createdAt: expect.stringMatching(ISO_TIME),
    });
  });

  it("2. workspace_icon = null даёт workspaceIcon = null", async () => {
    const { session, attempt } = await loginAndStart();
    const workspace = { ...notionWorkspace, icon: null };
    await notion.callback(attempt, { as: session }, { workspace });

    expectConnection(await getNotionConnection(session), { workspaceIcon: null });
  });

  it("2. новое подключение заменяет старое", async () => {
    const { session } = await loginAs();
    await notion.connect(session, notionWorkspace);
    await notion.connect(session, otherNotionWorkspace);

    expectConnection(await getNotionConnection(session), {
      workspaceId: otherNotionWorkspace.id,
      workspaceName: otherNotionWorkspace.name,
      status: "ok",
    });
  });
});

describe("ошибки callback", () => {
  it("4. повторный callback с тем же state даёт notion_error=state", async () => {
    const { session, attempt } = await loginAndStart();

    expectConnected(await notion.callback(attempt, { as: session }));
    expectConnectError(await notion.callback(attempt, { as: session }), "state");
  });

  it("4. state другого пользователя даёт notion_error=state", async () => {
    const { attempt } = await loginAndStart();
    const { session: stranger } = await loginAs({ telegramId: 2002 });

    expectConnectError(await notion.callback(attempt, { as: stranger }), "state");
  });

  it("4. callback через 11 минут после start даёт notion_error=state", async () => {
    const { session, attempt } = await loginAndStart(atMinute(0));
    const response = await notion.callback(attempt, { as: session, ...atMinute(11) });

    expectConnectError(response, "state");
  });

  it("4. callback через 9 минут после start проходит", async () => {
    const { session, attempt } = await loginAndStart(atMinute(0));
    const response = await notion.callback(attempt, { as: session, ...atMinute(9) });

    expectConnected(response);
  });

  it("4. неизвестный state даёт notion_error=state", async () => {
    const { session, attempt } = await loginAndStart();
    const response = await notion.callback({ ...attempt, state: "unknown-state" }, { as: session });

    expectConnectError(response, "state");
  });

  it("4. callback без сессии даёт notion_error=state", async () => {
    const { attempt } = await loginAndStart();

    expectConnectError(await notion.callback(attempt), "state");
  });

  it("4. error=access_denied даёт notion_error=cancelled", async () => {
    const { session, attempt } = await loginAndStart();

    expectConnectError(await notion.cancel(attempt, { as: session }), "cancelled");
  });

  it("4. error=access_denied без сессии тоже даёт notion_error=cancelled", async () => {
    const { attempt } = await loginAndStart();

    expectConnectError(await notion.cancel(attempt), "cancelled");
  });

  it("4. ответ 400 от token-эндпоинта даёт notion_error=token, подключение не создаётся", async () => {
    const { session, attempt } = await loginAndStart();
    const response = await notion.callback(attempt, { as: session }, { errorStatus: 400 });

    expectConnectError(response, "token");
    expectConnection(await getNotionConnection(session), null);
  });
});
