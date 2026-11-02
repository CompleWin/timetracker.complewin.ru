import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atSecond } from "./harness/clock.ts";
import { api, type TestResponse, type TestSession } from "./harness/index.ts";
import {
  EVENING,
  addSession,
  expectTaskSessionIds,
  interval,
  requestAddSession,
  requestDeleteSession,
  requestEditSession,
} from "./harness/manual-sessions.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";
import { createTask, taskPath, type TestTask } from "./harness/tasks.ts";
import { getTimerSession, sessionPath, type TestTimerSession } from "./harness/timers.ts";

type OwnedSession = {
  owner: TestSession;
  task: TestTask;
  stored: TestTimerSession;
};

type RequestById = (session: TestSession, id: string) => Promise<TestResponse>;

const NOTE = "повторил 50 карточек";
const NEW_SESSION = interval("11:00", "11:40");

const requestsById: [string, RequestById][] = [
  [
    "PATCH /api/sessions/:id",
    (session, id) => requestEditSession(session, id, { note: NOTE }, EVENING),
  ],
  ["DELETE /api/sessions/:id", (session, id) => requestDeleteSession(session, id, EVENING)],
  [
    "POST /api/tasks/:id/sessions",
    (session, id) => requestAddSession(session, id, NEW_SESSION, EVENING),
  ],
];

const requestsWithoutSession: [string, () => Promise<TestResponse>][] = [
  ["PATCH /api/sessions/:id", () => api.patch(sessionPath(MISSING_ID), { note: NOTE })],
  ["DELETE /api/sessions/:id", () => api.delete(sessionPath(MISSING_ID))],
  ["POST /api/tasks/:id/sessions", () => api.post(`${taskPath(MISSING_ID)}/sessions`, NEW_SESSION)],
];

async function ownerWithSession(): Promise<OwnedSession> {
  const { session: owner } = await loginAs({ telegramId: 1 }, atSecond(0));
  const task = await createTask(owner, { title: "Отчёт" }, atSecond(0));
  const stored = await addSession(owner, task.id, interval("10:00", "10:40"), EVENING);
  return { owner, task, stored };
}

async function stranger(): Promise<TestSession> {
  const { session } = await loginAs({ telegramId: 2 }, atSecond(0));
  return session;
}

describe("чужие сессии", () => {
  it("12. PATCH чужой сессии даёт 404 not_found и не меняет её", async () => {
    const { owner, stored } = await ownerWithSession();

    expectApiError(
      await requestEditSession(await stranger(), stored.id, { note: NOTE }, EVENING),
      "not_found",
    );
    expect(await getTimerSession(owner, stored.id, EVENING)).toMatchObject({
      status: 200,
      body: { session: stored },
    });
  });

  it("12. DELETE чужой сессии даёт 404 not_found, сессия остаётся", async () => {
    const { owner, task, stored } = await ownerWithSession();

    expectApiError(await requestDeleteSession(await stranger(), stored.id, EVENING), "not_found");
    await expectTaskSessionIds(owner, task.id, [stored], EVENING);
  });

  it("12. ручная сессия в чужой задаче даёт 404 not_found и не создаётся", async () => {
    const { owner, task, stored } = await ownerWithSession();

    expectApiError(
      await requestAddSession(await stranger(), task.id, NEW_SESSION, EVENING),
      "not_found",
    );
    await expectTaskSessionIds(owner, task.id, [stored], EVENING);
  });

  it.each(requestsById)(
    "12. %s с несуществующим или неверным ID даёт 404 not_found",
    async (_, send) => {
      const { session } = await loginAs({}, atSecond(0));

      expectApiError(await send(session, MISSING_ID), "not_found");
      expectApiError(await send(session, "not-a-uuid"), "not_found");
    },
  );

  it.each(requestsWithoutSession)("12. %s без сессии даёт 401 unauthorized", async (_, send) => {
    expectApiError(await send(), "unauthorized");
  });
});
