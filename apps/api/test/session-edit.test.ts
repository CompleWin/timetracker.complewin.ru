import { describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import { atClock, clockIso } from "./harness/clock.ts";
import type { TestSession } from "./harness/index.ts";
import {
  EVENING,
  addSession,
  editSession,
  expectStoredTimes,
  interval,
  requestEditSession,
} from "./harness/manual-sessions.ts";
import { getTask } from "./harness/tasks.ts";
import {
  getActiveTimers,
  loginWithTask,
  startTimer,
  type TestTimerSession,
} from "./harness/timers.ts";

type CreateSession = (session: TestSession, taskId: string) => Promise<TestTimerSession>;

const stoppedFrom10To1040: CreateSession = (session, taskId) =>
  addSession(session, taskId, interval("10:00", "10:40"), atClock("10:40"));

const runningSince10: CreateSession = (session, taskId) =>
  startTimer(session, taskId, atClock("10:00"));

const sessionKinds: [string, CreateSession][] = [
  ["остановленной", stoppedFrom10To1040],
  ["идущей", runningSince10],
];

describe("время при правке сессии", () => {
  it("3. endedAt позже «сейчас» даёт 400 с полем endedAt, сессия не меняется", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await stoppedFrom10To1040(session, task.id);

    expectValidationError(
      await requestEditSession(
        session,
        stopped.id,
        { endedAt: clockIso("12:00") },
        atClock("11:00"),
      ),
      ["endedAt"],
    );
    await expectStoredTimes(session, stopped, EVENING);
  });

  it("3. startedAt позже «сейчас» даёт 400 с полем startedAt, сессия не меняется", async () => {
    const { session, task } = await loginWithTask();
    const running = await runningSince10(session, task.id);

    expectValidationError(
      await requestEditSession(
        session,
        running.id,
        { startedAt: clockIso("11:30") },
        atClock("11:00"),
      ),
      ["startedAt"],
    );
    await expectStoredTimes(session, running, atClock("11:00"));
  });

  it.each([
    ["конец равен началу", { endedAt: clockIso("10:00") }],
    ["конец раньше начала", { endedAt: clockIso("09:30") }],
    [
      "новые начало и конец совпадают",
      { startedAt: clockIso("10:20"), endedAt: clockIso("10:20") },
    ],
  ])("3. у остановленной сессии 10:00–10:40 %s: 400 с полем endedAt", async (_, changes) => {
    const { session, task } = await loginWithTask();
    const stopped = await stoppedFrom10To1040(session, task.id);

    expectValidationError(await requestEditSession(session, stopped.id, changes, EVENING), [
      "endedAt",
    ]);
    await expectStoredTimes(session, stopped, EVENING);
  });

  it("3. endedAt раньше startedAt идущей сессии даёт 400 с полем endedAt, сессия идёт дальше", async () => {
    const { session, task } = await loginWithTask();
    const running = await runningSince10(session, task.id);

    expectValidationError(
      await requestEditSession(session, running.id, { endedAt: clockIso("09:30") }, EVENING),
      ["endedAt"],
    );
    await expectStoredTimes(session, running, EVENING);
  });

  it("3. новые начало и конец остановленной сессии сохраняются и пересчитывают durationSec", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await stoppedFrom10To1040(session, task.id);

    expect(
      await requestEditSession(session, stopped.id, interval("09:00", "09:50"), EVENING),
    ).toMatchObject({
      status: 200,
      body: {
        session: {
          id: stopped.id,
          startedAt: clockIso("09:00"),
          endedAt: clockIso("09:50"),
          durationSec: 3000,
        },
      },
    });
    expect(await getTask(session, task.id, EVENING)).toMatchObject({
      status: 200,
      body: { task: { totalSec: 3000 } },
    });
  });
});

describe("остановка идущей сессии через PATCH", () => {
  it("7. endedAt в PATCH идущей сессии останавливает её в указанный момент", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("12:00"));

    expect(
      await requestEditSession(
        session,
        running.id,
        { endedAt: clockIso("12:30") },
        atClock("13:00"),
      ),
    ).toMatchObject({
      status: 200,
      body: {
        session: {
          id: running.id,
          startedAt: running.startedAt,
          endedAt: clockIso("12:30"),
          durationSec: 1800,
        },
      },
    });
  });

  it("7. остановленная через PATCH сессия пропадает из GET /api/timers/active", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("12:00"));

    await editSession(session, running.id, { endedAt: clockIso("12:30") }, atClock("13:00"));

    expect(await getActiveTimers(session, atClock("13:00"))).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
    expect(await getTask(session, task.id, atClock("14:00"))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: null, totalSec: 1800 } },
    });
  });
});

describe("endedAt: null", () => {
  it.each(sessionKinds)(
    "8. endedAt null в PATCH %s сессии даёт 400 с полем endedAt",
    async (_, create) => {
      const { session, task } = await loginWithTask();
      const target = await create(session, task.id);

      expectValidationError(
        await requestEditSession(session, target.id, { endedAt: null }, EVENING),
        ["endedAt"],
      );
      await expectStoredTimes(session, target, EVENING);
    },
  );
});
