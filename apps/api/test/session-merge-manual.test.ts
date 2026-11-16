import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atClock, clockIso, clockSecondsIso } from "./harness/clock.ts";
import {
  EVENING,
  addSession,
  editSession,
  expectStoredTimes,
  expectTaskSessionIds,
  interval,
  requestAddSession,
} from "./harness/manual-sessions.ts";
import { createTask, getTask } from "./harness/tasks.ts";
import {
  getTimerSession,
  loginWithTask,
  startTimer,
  type TestTimerSession,
  type UserWithTask,
} from "./harness/timers.ts";

type TaskWithSession = UserWithTask & { first: TestTimerSession };

const HALF_OF_LONG_NOTES = "я".repeat(6_000);

async function taskWithSessionFrom10To1030(note = ""): Promise<TaskWithSession> {
  const { session, task } = await loginWithTask();
  const first = await addSession(
    session,
    task.id,
    { ...interval("10:00", "10:30"), note },
    EVENING,
  );
  return { session, task, first };
}

describe("ручная сессия рядом с сессией задачи", () => {
  it.each([
    ["9. ручная 10:30–11:00", clockIso("10:30")],
    ["10. ручная 10:30:45–11:00", clockSecondsIso("10:30:45")],
  ])(
    "%s после сессии 10:00–10:30 сливается с ней: 201 с id первой, 10:00–11:00, у задачи одна сессия",
    async (_, startedAt) => {
      const { session, task, first } = await taskWithSessionFrom10To1030();
      const manual = { startedAt, endedAt: clockIso("11:00") };

      expect(await requestAddSession(session, task.id, manual, EVENING)).toMatchObject({
        status: 201,
        body: {
          session: {
            id: first.id,
            startedAt: clockIso("10:00"),
            endedAt: clockIso("11:00"),
            durationSec: 3600,
          },
        },
      });
      await expectTaskSessionIds(session, task.id, [first], EVENING);
    },
  );

  it("11. ручная 10:32–11:00 после сессии 10:00–10:30 не сливается: у задачи две сессии", async () => {
    const { session, task, first } = await taskWithSessionFrom10To1030();

    const manual = await addSession(session, task.id, interval("10:32", "11:00"), EVENING);

    expect(manual).toMatchObject({ startedAt: clockIso("10:32"), endedAt: clockIso("11:00") });
    await expectTaskSessionIds(session, task.id, [manual, first], EVENING);
    await expectStoredTimes(session, first, EVENING);
  });

  it("12. ручная 10:30–11:00 между сессиями 10:00–10:30 и 11:00–11:30 сливает все три: 201 с id сессии 10:00, 10:00–11:30, сессия 11:00 даёт 404", async () => {
    const { session, task, first } = await taskWithSessionFrom10To1030();
    const later = await addSession(session, task.id, interval("11:00", "11:30"), EVENING);

    expect(
      await requestAddSession(session, task.id, interval("10:30", "11:00"), EVENING),
    ).toMatchObject({
      status: 201,
      body: {
        session: { id: first.id, startedAt: clockIso("10:00"), endedAt: clockIso("11:30") },
      },
    });
    await expectTaskSessionIds(session, task.id, [first], EVENING);
    expectApiError(await getTimerSession(session, later.id, EVENING), "not_found");
  });

  it("13. ручная 09:00–10:00 перед таймером, идущим с 10:00: 201 с id ручной сессии, startedAt 09:00, endedAt null, она же runningSessionId", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("10:00"));
    const now = atClock("10:30");

    const response = await requestAddSession(session, task.id, interval("09:00", "10:00"), now);

    expect(response).toMatchObject({
      status: 201,
      body: { session: { startedAt: clockIso("09:00"), endedAt: null } },
    });
    const merged: TestTimerSession = response.body.session;
    expect(merged.id).not.toBe(running.id);
    expect(await getTask(session, task.id, now)).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: merged.id } },
    });
    await expectTaskSessionIds(session, task.id, [merged], now);
    expectApiError(await getTimerSession(session, running.id, now), "not_found");
  });
});

describe("заметка слитой сессии", () => {
  it.each([
    ["«читал» и «конспект» дают «читал\\nконспект»", "читал", "конспект", "читал\nконспект"],
    ["пустая и «конспект» дают «конспект»", "", "конспект", "конспект"],
    ["«читал» и пустая дают «читал»", "читал", "", "читал"],
  ])("14. заметки %s", async (_, firstNote, manualNote, mergedNote) => {
    const { session, task, first } = await taskWithSessionFrom10To1030(firstNote);
    const manual = { ...interval("10:30", "11:00"), note: manualNote };

    expect(await requestAddSession(session, task.id, manual, EVENING)).toMatchObject({
      status: 201,
      body: { session: { id: first.id, note: mergedNote } },
    });
  });

  it("15. заметки по 6 000 символов у сессии 10:00–10:30 и ручной 10:30–11:00: две сессии", async () => {
    const { session, task, first } = await taskWithSessionFrom10To1030(HALF_OF_LONG_NOTES);

    const manual = await addSession(
      session,
      task.id,
      { ...interval("10:30", "11:00"), note: HALF_OF_LONG_NOTES },
      EVENING,
    );

    expect(manual).toMatchObject({ startedAt: clockIso("10:30"), note: HALF_OF_LONG_NOTES });
    await expectTaskSessionIds(session, task.id, [manual, first], EVENING);
    await expectStoredTimes(session, first, EVENING);
  });

  it("15. правка только заметки у таких сессий ничего не сливает", async () => {
    const { session, task, first } = await taskWithSessionFrom10To1030(HALF_OF_LONG_NOTES);
    const manual = await addSession(
      session,
      task.id,
      { ...interval("10:30", "11:00"), note: HALF_OF_LONG_NOTES },
      EVENING,
    );

    expect(await editSession(session, manual.id, { note: "" }, EVENING)).toMatchObject({
      id: manual.id,
      startedAt: clockIso("10:30"),
      note: "",
    });
    await expectTaskSessionIds(session, task.id, [manual, first], EVENING);
  });
});

describe("сессии разных задач", () => {
  it("16. ручная 10:30–11:00 этой задачи рядом с сессией другой задачи 10:00–10:30: две сессии разных задач", async () => {
    const { session, task: other, first: otherSession } = await taskWithSessionFrom10To1030();
    const run = await createTask(session, { title: "Беговая дорожка" }, EVENING);

    const manual = await addSession(session, run.id, interval("10:30", "11:00"), EVENING);

    expect(manual).toMatchObject({ taskId: run.id, startedAt: clockIso("10:30") });
    await expectTaskSessionIds(session, run.id, [manual], EVENING);
    await expectTaskSessionIds(session, other.id, [otherSession], EVENING);
    await expectStoredTimes(session, otherSession, EVENING);
  });
});
