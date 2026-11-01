import { describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import { atSecond } from "./harness/clock.ts";
import type { TestResponse, TestSession } from "./harness/index.ts";
import { createTask, type TestTask } from "./harness/tasks.ts";
import {
  getTaskSessions,
  loginWithTask,
  recordSession,
  startTimer,
  type TestTimerSession,
} from "./harness/timers.ts";

type TaskHistory = {
  session: TestSession;
  task: TestTask;
  first: TestTimerSession;
  second: TestTimerSession;
  third: TestTimerSession;
};

const DEFAULT_LIMIT = 50;
const LIST_AT = atSecond(230);
const SECOND_SESSION_START = 100;
const LONG_HISTORY_TIMEOUT_MS = 30_000;

async function taskWithThreeSessions(): Promise<TaskHistory> {
  const { session, task } = await loginWithTask();
  const other = await createTask(session, { title: "Беговая дорожка" }, atSecond(0));
  const first = await recordSession(session, task.id, 0, 60);
  const second = await recordSession(session, task.id, SECOND_SESSION_START, 160);
  await recordSession(session, other.id, 150, 170);
  const third = await startTimer(session, task.id, atSecond(200));
  return { session, task, first, second, third };
}

function expectSessionIds(response: TestResponse, sessions: TestTimerSession[]): void {
  expect(response).toMatchObject({
    status: 200,
    body: { sessions: sessions.map(({ id }) => ({ id })) },
  });
}

describe("GET /api/tasks/:id/sessions", () => {
  it("15. сессии задачи отсортированы по startedAt по убыванию", async () => {
    const { session, task, first, second, third } = await taskWithThreeSessions();

    expect(await getTaskSessions(session, task.id, {}, LIST_AT)).toMatchObject({
      status: 200,
      body: { sessions: [{ ...third, durationSec: 30 }, second, first] },
    });
  });

  it("15. limit=2 оставляет две последние сессии", async () => {
    const { session, task, second, third } = await taskWithThreeSessions();

    expectSessionIds(await getTaskSessions(session, task.id, { limit: "2" }, LIST_AT), [
      third,
      second,
    ]);
  });

  it.each([
    ["в UTC", atSecond(SECOND_SESSION_START).now],
    ["со смещением", "2030-01-01T03:01:40+03:00"],
  ])(
    "15. before = startedAt второй сессии %s оставляет сессии строго раньше",
    async (_, before) => {
      const { session, task, first } = await taskWithThreeSessions();

      expectSessionIds(await getTaskSessions(session, task.id, { before }, LIST_AT), [first]);
    },
  );

  it("15. before и limit работают вместе", async () => {
    const { session, task, second, third } = await taskWithThreeSessions();
    const query = { before: third.startedAt, limit: "1" };

    expectSessionIds(await getTaskSessions(session, task.id, query, LIST_AT), [second]);
  });

  it(
    "15. по умолчанию limit = 50",
    async () => {
      const { session, task } = await loginWithTask();
      const recorded: TestTimerSession[] = [];
      for (let index = 0; index <= DEFAULT_LIMIT; index++) {
        recorded.push(await recordSession(session, task.id, index * 10, index * 10 + 5));
      }
      const newestFirst = recorded.reverse().slice(0, DEFAULT_LIMIT);

      expectSessionIds(await getTaskSessions(session, task.id, {}, atSecond(1_000)), newestFirst);
    },
    LONG_HISTORY_TIMEOUT_MS,
  );

  it("15. limit=200 принимается", async () => {
    const { session, task, first, second, third } = await taskWithThreeSessions();

    expectSessionIds(await getTaskSessions(session, task.id, { limit: "200" }, LIST_AT), [
      third,
      second,
      first,
    ]);
  });

  it.each(["0", "201", "abc"])("15. limit=%s даёт 400 с полем limit", async (limit) => {
    const { session, task } = await loginWithTask();

    expectValidationError(await getTaskSessions(session, task.id, { limit }, LIST_AT), ["limit"]);
  });

  it("15. before=abc даёт 400 с полем before", async () => {
    const { session, task } = await loginWithTask();

    expectValidationError(await getTaskSessions(session, task.id, { before: "abc" }, LIST_AT), [
      "before",
    ]);
  });
});
