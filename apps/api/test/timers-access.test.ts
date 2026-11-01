import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import type { TestResponse, TestSession } from "./harness/index.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";
import { createTask, getTask, type TestTask } from "./harness/tasks.ts";
import {
  getActiveTimers,
  getTaskSessions,
  getTimerSession,
  requestStart,
  requestStopSession,
  requestStopTask,
  startTimer,
  type TestTimerSession,
} from "./harness/timers.ts";

type OwnedTimer = {
  owner: TestSession;
  task: TestTask;
  running: TestTimerSession;
};

type RequestById = (session: TestSession, id: string) => Promise<TestResponse>;

const requestsById: [string, RequestById][] = [
  ["POST /api/tasks/:id/start", (session, id) => requestStart(session, id)],
  ["POST /api/tasks/:id/stop", (session, id) => requestStopTask(session, id)],
  ["POST /api/sessions/:id/stop", (session, id) => requestStopSession(session, id)],
  ["GET /api/sessions/:id", (session, id) => getTimerSession(session, id)],
  ["GET /api/tasks/:id/sessions", (session, id) => getTaskSessions(session, id)],
];

async function ownerWithRunningTimer(): Promise<OwnedTimer> {
  const { session: owner } = await loginAs({ telegramId: 1 });
  const task = await createTask(owner, { title: "Отчёт" });
  const running = await startTimer(owner, task.id);
  return { owner, task, running };
}

async function stranger(): Promise<TestSession> {
  const { session } = await loginAs({ telegramId: 2 });
  return session;
}

describe("чужие задачи и сессии", () => {
  it("16. запуск чужой задачи даёт 404 not_found, таймер не запускается", async () => {
    const { session: owner } = await loginAs({ telegramId: 1 });
    const task = await createTask(owner, { title: "Отчёт" });

    expectApiError(await requestStart(await stranger(), task.id), "not_found");
    expect(await getTask(owner, task.id)).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: null } },
    });
  });

  it("16. остановка чужой сессии даёт 404 not_found, сессия продолжает идти", async () => {
    const { owner, task, running } = await ownerWithRunningTimer();

    expectApiError(await requestStopSession(await stranger(), running.id), "not_found");
    expect(await getTask(owner, task.id)).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: running.id } },
    });
  });

  it("16. остановка чужой задачи даёт 404 not_found, сессия продолжает идти", async () => {
    const { owner, task, running } = await ownerWithRunningTimer();

    expectApiError(await requestStopTask(await stranger(), task.id), "not_found");
    expect(await getTimerSession(owner, running.id)).toMatchObject({
      status: 200,
      body: { session: { id: running.id, endedAt: null } },
    });
  });

  it("16. чужая сессия и список сессий чужой задачи дают 404 not_found", async () => {
    const { task, running } = await ownerWithRunningTimer();
    const session = await stranger();

    expectApiError(await getTimerSession(session, running.id), "not_found");
    expectApiError(await getTaskSessions(session, task.id), "not_found");
  });

  it("16. чужие таймеры не попадают в GET /api/timers/active", async () => {
    await ownerWithRunningTimer();

    expect(await getActiveTimers(await stranger())).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
  });

  it.each(requestsById)(
    "16. %s с несуществующим или неверным ID даёт 404 not_found",
    async (_, send) => {
      const { session } = await loginAs();

      expectApiError(await send(session, MISSING_ID), "not_found");
      expectApiError(await send(session, "not-a-uuid"), "not_found");
    },
  );
});
