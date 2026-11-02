import { describe, expect, it } from "vitest";
import { atClock, atSecond, clockIso } from "./harness/clock.ts";
import {
  EVENING,
  addSession,
  expectOverlap,
  expectStoredTimes,
  expectTaskSessionIds,
  interval,
  requestAddSession,
  requestEditSession,
} from "./harness/manual-sessions.ts";
import { createTask } from "./harness/tasks.ts";
import {
  getActiveTimers,
  loginWithTask,
  startTimer,
  type TestTimerSession,
  type UserWithTask,
} from "./harness/timers.ts";

type TaskWithSession = UserWithTask & { existing: TestTimerSession };

type TaskWithTimer = UserWithTask & { running: TestTimerSession };

const EXISTING_START = "10:00";
const EXISTING_END = "11:00";

async function taskWithSessionFrom10To11(): Promise<TaskWithSession> {
  const { session, task } = await loginWithTask();
  const existing = await addSession(
    session,
    task.id,
    interval(EXISTING_START, EXISTING_END),
    atClock(EXISTING_END),
  );
  return { session, task, existing };
}

async function taskRunningSince12(): Promise<TaskWithTimer> {
  const { session, task } = await loginWithTask();
  const running = await startTimer(session, task.id, atClock("12:00"));
  return { session, task, running };
}

describe("пересечение с остановленной сессией", () => {
  it.each([
    ["10:30", "11:30"],
    ["09:30", "10:30"],
    ["10:15", "10:45"],
    ["09:00", "12:00"],
    ["10:00", "11:00"],
  ])(
    "4. сессия %s–%s при существующей 10:00–11:00 даёт 409 overlap с details.sessionId",
    async (start, end) => {
      const { session, task, existing } = await taskWithSessionFrom10To11();

      expectOverlap(
        await requestAddSession(session, task.id, interval(start, end), EVENING),
        existing,
      );
      await expectTaskSessionIds(session, task.id, [existing], EVENING);
    },
  );

  it.each([
    ["11:00", "11:30"],
    ["09:30", "10:00"],
  ])("4. сессия %s–%s впритык к существующей 10:00–11:00 создаётся", async (start, end) => {
    const { session, task } = await taskWithSessionFrom10To11();

    expect(await requestAddSession(session, task.id, interval(start, end), EVENING)).toMatchObject({
      status: 201,
      body: { session: { startedAt: clockIso(start), endedAt: clockIso(end) } },
    });
  });

  it("4. правка остановленной сессии на пересечение с другой даёт 409 overlap", async () => {
    const { session, task, existing } = await taskWithSessionFrom10To11();
    const later = await addSession(session, task.id, interval("11:00", "11:30"), EVENING);

    expectOverlap(
      await requestEditSession(session, later.id, { startedAt: clockIso("10:59") }, EVENING),
      existing,
    );
    await expectStoredTimes(session, later, EVENING);
  });

  it("4. сессия не пересекается сама с собой при правке", async () => {
    const { session, existing } = await taskWithSessionFrom10To11();

    expect(
      await requestEditSession(session, existing.id, interval("10:30", "11:30"), EVENING),
    ).toMatchObject({
      status: 200,
      body: { session: { id: existing.id, durationSec: 3600 } },
    });
  });
});

describe("пересечение с идущей сессией", () => {
  it("5. при таймере, идущем с 12:00, ручная сессия 12:30–12:45 даёт 409 overlap", async () => {
    const { session, task, running } = await taskRunningSince12();

    expectOverlap(
      await requestAddSession(session, task.id, interval("12:30", "12:45"), atClock("13:00")),
      running,
    );
  });

  it.each([
    ["11:00", "11:59"],
    ["11:00", "12:00"],
  ])("5. при таймере, идущем с 12:00, сессия %s–%s создаётся", async (start, end) => {
    const { session, task } = await taskRunningSince12();

    expect(
      await requestAddSession(session, task.id, interval(start, end), atClock("13:00")),
    ).toMatchObject({ status: 201 });
  });

  it("6. перенос начала идущей сессии на время остановленной сессии даёт 409 overlap", async () => {
    const { session, task, existing } = await taskWithSessionFrom10To11();
    const running = await startTimer(session, task.id, atClock("12:00"));

    expectOverlap(
      await requestEditSession(
        session,
        running.id,
        { startedAt: clockIso("10:30") },
        atClock("12:30"),
      ),
      existing,
    );
    await expectStoredTimes(session, running, atClock("12:30"));
  });

  it("6. начало идущей сессии переносится раньше, если пересечения нет, и сессия идёт дальше", async () => {
    const { session, task } = await taskWithSessionFrom10To11();
    const running = await startTimer(session, task.id, atClock("12:00"));

    expect(
      await requestEditSession(
        session,
        running.id,
        { startedAt: clockIso(EXISTING_END) },
        atClock("12:30"),
      ),
    ).toMatchObject({
      status: 200,
      body: {
        session: {
          id: running.id,
          startedAt: clockIso(EXISTING_END),
          endedAt: null,
          durationSec: 5400,
        },
      },
    });
    expect(await getActiveTimers(session, atClock("12:30"))).toMatchObject({
      status: 200,
      body: { sessions: [{ id: running.id, startedAt: clockIso(EXISTING_END) }] },
    });
  });
});

describe("сессии разных задач", () => {
  it("11. ручные сессии разных задач могут пересекаться", async () => {
    const { session, existing } = await taskWithSessionFrom10To11();
    const other = await createTask(session, { title: "Беговая дорожка" }, atSecond(0));

    expect(
      await requestAddSession(session, other.id, interval("10:30", "11:30"), EVENING),
    ).toMatchObject({ status: 201 });
    await expectStoredTimes(session, existing, EVENING);
  });

  it("11. ручная сессия может пересекаться с идущим таймером другой задачи", async () => {
    const { session } = await taskRunningSince12();
    const other = await createTask(session, { title: "Беговая дорожка" }, atSecond(0));

    expect(
      await requestAddSession(session, other.id, interval("12:30", "12:45"), atClock("13:00")),
    ).toMatchObject({ status: 201 });
  });
});
