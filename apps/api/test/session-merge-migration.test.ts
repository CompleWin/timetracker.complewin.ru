import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atClock, clockIso, clockSecondsIso } from "./harness/clock.ts";
import type { TestSession } from "./harness/index.ts";
import {
  EVENING,
  addSession,
  deleteSession,
  expectStoredTimes,
  expectTaskSessionIds,
  interval,
  type ManualSessionInput,
} from "./harness/manual-sessions.ts";
import { cronAt, fakeNotionSync, syncStatus } from "./harness/notion-sync.ts";
import { userWithTaskPage } from "./harness/notion-task-pages.ts";
import { moveSessionStart, replaySessionMergeMigration } from "./harness/schema-replay.ts";
import { getTask } from "./harness/tasks.ts";
import {
  getTaskSessions,
  getTimerSession,
  loginWithTask,
  startTimer,
  type TestTimerSession,
} from "./harness/timers.ts";

type AddInEvening = (input: ManualSessionInput) => Promise<TestTimerSession>;

function addingInEvening(session: TestSession, taskId: string): AddInEvening {
  return (input) => addSession(session, taskId, input, EVENING);
}

describe("миграция слияния сессий", () => {
  it("22. цепочка 10:00–10:30 «а», 10:30:30–11:00, 11:00–11:20 «б» сливается в 10:00–11:20 «а\\nб» с id первой, 12:00–12:30 остаётся", async () => {
    const { session, task } = await loginWithTask();
    const add = addingInEvening(session, task.id);
    const first = await add({ ...interval("10:00", "10:30"), note: "а" });
    const withEmptyNote = await add(interval("10:35", "11:00"));
    const withNote = await add({ ...interval("11:05", "11:20"), note: "б" });
    const separate = await add(interval("12:00", "12:30"));

    await replaySessionMergeMigration(
      moveSessionStart(withEmptyNote, clockSecondsIso("10:30:30")),
      moveSessionStart(withNote, clockIso("11:00")),
    );

    expect(await getTaskSessions(session, task.id, {}, EVENING)).toMatchObject({
      status: 200,
      body: {
        sessions: [
          { id: separate.id, startedAt: clockIso("12:00"), endedAt: clockIso("12:30") },
          {
            id: first.id,
            startedAt: clockIso("10:00"),
            endedAt: clockIso("11:20"),
            note: "а\nб",
          },
        ],
      },
    });
  });

  it("23. сессия 10:00–10:30 и идущая с 10:30:20 сливаются в одну идущую с 10:00, runningSessionId равен id сессии 10:00", async () => {
    const { session, task } = await loginWithTask();
    const first = await addSession(session, task.id, interval("10:00", "10:30"), atClock("10:32"));
    const running = await startTimer(session, task.id, atClock("10:32"));
    const now = atClock("11:00");

    await replaySessionMergeMigration(moveSessionStart(running, clockSecondsIso("10:30:20")));

    expect(await getTaskSessions(session, task.id, {}, now)).toMatchObject({
      status: 200,
      body: { sessions: [{ id: first.id, startedAt: clockIso("10:00"), endedAt: null }] },
    });
    expect(await getTask(session, task.id, now)).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: first.id } },
    });
  });

  it("24. удалённая сессия 10:00–10:30 и живая 10:30–11:00: живая не меняется, удалённая остаётся удалённой", async () => {
    const { session, task } = await loginWithTask();
    const removed = await addSession(session, task.id, interval("10:00", "10:30"), EVENING);
    await deleteSession(session, removed.id, EVENING);
    const live = await addSession(session, task.id, interval("10:30", "11:00"), EVENING);

    await replaySessionMergeMigration();

    await expectStoredTimes(session, live, EVENING);
    await expectTaskSessionIds(session, task.id, [live], EVENING);
    expectApiError(await getTimerSession(session, removed.id, EVENING), "not_found");
  });

  it("25. задача со страницей Notion, у которой сессии слились, после миграции стоит в очереди синка", async () => {
    const fake = fakeNotionSync();
    const { session, task } = await userWithTaskPage(fake);
    const add = addingInEvening(session, task.id);
    await add(interval("10:00", "10:30"));
    const later = await add(interval("10:35", "11:00"));
    await cronAt(EVENING);
    expect(await syncStatus(session, EVENING)).toMatchObject({ pendingTasks: 0 });

    await replaySessionMergeMigration(moveSessionStart(later, clockIso("10:30")));

    expect(await syncStatus(session, EVENING)).toMatchObject({ pendingTasks: 1 });
  });
});
