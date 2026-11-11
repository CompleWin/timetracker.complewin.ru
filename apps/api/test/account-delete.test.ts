import { beforeEach, describe, expect, it } from "vitest";
import {
  answerNotionRevoke,
  deleteAccount,
  externalCallsDuring,
  NOTION_REVOKE_URL,
  tablesMentioningUser,
  type RevokeReply,
} from "./harness/account.ts";
import { expectApiError } from "./harness/assertions.ts";
import { atMinute, atSecond } from "./harness/clock.ts";
import { api, type TestSession } from "./harness/index.ts";
import { SETUP_TIME, fakeNotionSync, type FakeNotionSync } from "./harness/notion-sync.ts";
import { connectWithLinkedTask } from "./harness/notion-task-pages.ts";
import {
  NOTION_CLIENT_AUTH,
  fakeNotion,
  jsonBodyOf,
  loginWithNotion,
  onlyCall,
} from "./harness/notion.ts";
import { createProject, expectProjectNames, listProjects } from "./harness/projects.ts";
import { requireStatus } from "./harness/rest.ts";
import { loginAs, sessionSetCookie, type LoggedIn } from "./harness/session.ts";
import { createTask } from "./harness/tasks.ts";
import { recordSession, startTimer } from "./harness/timers.ts";

const TELEGRAM_ID = 918_273_645_546;
const OTHER_TELEGRAM_ID = 918_273_645_547;
const AFTER_SETUP = atMinute(10);

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

async function userWithEverything(telegramId: number): Promise<LoggedIn> {
  const loggedIn = await loginAs({ telegramId }, SETUP_TIME);
  const { session } = loggedIn;
  const { task: linkedTask } = await connectWithLinkedTask(fake, session);
  const project = await createProject(session, { name: "Спорт" }, SETUP_TIME);
  const ownTask = await createTask(
    session,
    { title: "Беговая дорожка", projectId: project.id },
    SETUP_TIME,
  );
  await recordSession(session, linkedTask.id, 0, 60);
  await startTimer(session, ownTask.id, atSecond(120));
  await fake.notion.start({ as: session, ...SETUP_TIME });
  return loggedIn;
}

async function deleteWithRevokeReply(session: TestSession, reply: RevokeReply): Promise<void> {
  answerNotionRevoke(reply);
  const response = await deleteAccount(session, AFTER_SETUP);
  expect(response).toMatchObject({ status: 204 });
}

async function visibleData(session: TestSession): Promise<unknown[]> {
  const paths = [
    "/api/me",
    "/api/projects",
    "/api/tasks",
    "/api/timers/active",
    "/api/notion/connection",
    "/api/notion/sync",
  ];
  const bodies: unknown[] = [];
  for (const path of paths) {
    const response = await api.get(path, { ...AFTER_SETUP, as: session });
    bodies.push(requireStatus(response, 200, `GET ${path}`).body);
  }
  return bodies;
}

describe("DELETE /api/me", () => {
  it("1. отвечает 204 и очищает cookie, старая cookie потом даёт 401", async () => {
    const { session } = await loginAs();

    const response = await deleteAccount(session);

    expect(response).toMatchObject({ status: 204 });
    expect(sessionSetCookie(response)).toMatchObject({ value: "" });
    expectApiError(await api.get("/api/me", { as: session }), "unauthorized");
  });

  it("2. после удаления ни в одной таблице D1 нет строк с id и telegramId пользователя", async () => {
    const { session, user } = await userWithEverything(TELEGRAM_ID);
    expect(await tablesMentioningUser(user)).not.toEqual([]);

    await deleteWithRevokeReply(session, 200);

    expect(await tablesMentioningUser(user)).toEqual([]);
  });
});

describe("отзыв токена Notion", () => {
  it("3. у пользователя с Notion ровно один внешний запрос: POST /v1/oauth/revoke с его access_token и Basic-авторизацией", async () => {
    const { session, grant } = await loginWithNotion(fakeNotion());
    answerNotionRevoke();

    const calls = await externalCallsDuring(() => deleteAccount(session));

    const revoke = onlyCall(calls);
    expect(revoke).toMatchObject({
      method: "POST",
      url: NOTION_REVOKE_URL,
      headers: { authorization: NOTION_CLIENT_AUTH },
    });
    expect(jsonBodyOf(revoke)).toMatchObject({ token: grant.accessToken });
  });

  it("3. у пользователя без Notion удаление не делает внешних запросов", async () => {
    const { session } = await loginAs();

    const calls = await externalCallsDuring(() => deleteAccount(session));

    expect(calls).toEqual([]);
  });

  it.each<RevokeReply>([500, "network"])(
    "4. при ответе Notion %s удаление отвечает 204 и данных не остаётся",
    async (reply) => {
      const { session, user } = await userWithEverything(TELEGRAM_ID);

      await deleteWithRevokeReply(session, reply);

      expect(await tablesMentioningUser(user)).toEqual([]);
    },
  );
});

describe("после удаления", () => {
  it("5. dev-login с тем же telegramId создаёт нового пользователя без проектов", async () => {
    const { session, user } = await loginAs({ telegramId: TELEGRAM_ID });
    await createProject(session, { name: "Спорт" });
    expect(await deleteAccount(session)).toMatchObject({ status: 204 });

    const again = await loginAs({ telegramId: TELEGRAM_ID });

    expect(again.user.id).not.toBe(user.id);
    expectProjectNames(await listProjects(again.session), []);
  });

  it("6. данные другого пользователя остаются на месте", async () => {
    const other = await userWithEverything(OTHER_TELEGRAM_ID);
    const deleted = await userWithEverything(TELEGRAM_ID);
    const before = await visibleData(other.session);

    await deleteWithRevokeReply(deleted.session, 200);

    expect(await visibleData(other.session)).toMatchObject(before);
  });
});
