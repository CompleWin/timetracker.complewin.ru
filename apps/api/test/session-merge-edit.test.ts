import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { clockIso, clockSecondsIso } from "./harness/clock.ts";
import {
  EVENING,
  addSession,
  deleteSession,
  expectStoredTimes,
  expectTaskSessionIds,
  interval,
  requestEditSession,
  type SessionInterval,
} from "./harness/manual-sessions.ts";
import {
  getTimerSession,
  loginWithTask,
  type TestTimerSession,
  type UserWithTask,
} from "./harness/timers.ts";

type TaskWithTwoSessions = UserWithTask & {
  first: TestTimerSession;
  second: TestTimerSession;
};

const SESSION_AT_11 = interval("11:00", "11:30");

async function taskWithTwoSessions(
  secondTimes: SessionInterval = SESSION_AT_11,
): Promise<TaskWithTwoSessions> {
  const { session, task } = await loginWithTask();
  const first = await addSession(session, task.id, interval("10:00", "10:30"), EVENING);
  const second = await addSession(session, task.id, secondTimes, EVENING);
  return { session, task, first, second };
}

function mergedFrom10To1130(first: TestTimerSession): Record<string, unknown> {
  return {
    status: 200,
    body: {
      session: { id: first.id, startedAt: clockIso("10:00"), endedAt: clockIso("11:30") },
    },
  };
}

describe("правка времени сессии", () => {
  it("17. PATCH второй сессии с startedAt 10:30 сливает её с первой: 200 с id первой, 10:00–11:30, вторая даёт 404", async () => {
    const { session, task, first, second } = await taskWithTwoSessions();

    expect(
      await requestEditSession(session, second.id, { startedAt: clockIso("10:30") }, EVENING),
    ).toMatchObject(mergedFrom10To1130(first));
    expectApiError(await getTimerSession(session, second.id, EVENING), "not_found");
    await expectTaskSessionIds(session, task.id, [first], EVENING);
  });

  it("18. PATCH первой сессии с endedAt 11:00 сливает её со второй: 200 с id первой, 10:00–11:30", async () => {
    const { session, task, first, second } = await taskWithTwoSessions();

    expect(
      await requestEditSession(session, first.id, { endedAt: clockIso("11:00") }, EVENING),
    ).toMatchObject(mergedFrom10To1130(first));
    expectApiError(await getTimerSession(session, second.id, EVENING), "not_found");
    await expectTaskSessionIds(session, task.id, [first], EVENING);
  });

  it("19. PATCH второй сессии с startedAt 10:31:01 (пауза 61 с) оставляет две сессии", async () => {
    const { session, task, first, second } = await taskWithTwoSessions();
    const startedAt = clockSecondsIso("10:31:01");

    expect(await requestEditSession(session, second.id, { startedAt }, EVENING)).toMatchObject({
      status: 200,
      body: { session: { id: second.id, startedAt, endedAt: clockIso("11:30") } },
    });
    await expectTaskSessionIds(session, task.id, [second, first], EVENING);
    await expectStoredTimes(session, first, EVENING);
  });
});

describe("удаление сессии", () => {
  it("20. удаление сессии 10:35–11:00 рядом с 10:00–10:30 ничего не сливает", async () => {
    const { session, task, first, second } = await taskWithTwoSessions(interval("10:35", "11:00"));

    await deleteSession(session, second.id, EVENING);

    await expectStoredTimes(session, first, EVENING);
    await expectTaskSessionIds(session, task.id, [first], EVENING);
  });
});
