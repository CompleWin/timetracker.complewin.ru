import { describe, expect, it } from "vitest";
import { atClock, atSecond, clockIso } from "./harness/clock.ts";
import type { TestSession } from "./harness/index.ts";
import {
  EVENING,
  addSession,
  deleteSession,
  editSession,
  interval,
} from "./harness/manual-sessions.ts";
import { getTask, listTasks } from "./harness/tasks.ts";
import { loginWithTask, startTimer, type TestTimerSession } from "./harness/timers.ts";

type TwoStoppedSessions = {
  session: TestSession;
  taskId: string;
  morning: TestTimerSession;
  noon: TestTimerSession;
};

async function taskWithMorningAndNoonSessions(): Promise<TwoStoppedSessions> {
  const { session, task } = await loginWithTask();
  const morning = await addSession(session, task.id, interval("10:00", "10:30"), EVENING);
  const noon = await addSession(session, task.id, interval("12:00", "12:30"), EVENING);
  return { session, taskId: task.id, morning, noon };
}

async function expectLastStartedAt(
  session: TestSession,
  taskId: string,
  lastStartedAt: string | null,
): Promise<void> {
  expect(await getTask(session, taskId, EVENING)).toMatchObject({
    status: 200,
    body: { task: { lastStartedAt } },
  });
}

describe("lastStartedAt задачи", () => {
  it("5. у новой задачи lastStartedAt null", async () => {
    const { session, task } = await loginWithTask();

    expect(task).toMatchObject({ lastStartedAt: null });
    await expectLastStartedAt(session, task.id, null);
  });

  it("5. после запуска таймера lastStartedAt равен startedAt", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atSecond(30));

    expect(await getTask(session, task.id, atSecond(40))).toMatchObject({
      status: 200,
      body: { task: { lastStartedAt: running.startedAt } },
    });
  });

  it("5. при остановленных сессиях 10:00 и 12:00 lastStartedAt равен 12:00, в том числе в списке задач", async () => {
    const { session, taskId } = await taskWithMorningAndNoonSessions();

    await expectLastStartedAt(session, taskId, clockIso("12:00"));
    expect(await listTasks(session, {}, EVENING)).toMatchObject({
      status: 200,
      body: { tasks: [{ id: taskId, lastStartedAt: clockIso("12:00") }] },
    });
  });

  it("5. удаление сессии 12:00 даёт 10:00", async () => {
    const { session, taskId, noon } = await taskWithMorningAndNoonSessions();

    await deleteSession(session, noon.id, EVENING);

    await expectLastStartedAt(session, taskId, clockIso("10:00"));
  });

  it("5. перенос сессии 10:00–10:30 на 13:00–13:30 даёт 13:00", async () => {
    const { session, taskId, morning, noon } = await taskWithMorningAndNoonSessions();
    await deleteSession(session, noon.id, EVENING);

    await editSession(session, morning.id, interval("13:00", "13:30"), EVENING);

    await expectLastStartedAt(session, taskId, clockIso("13:00"));
  });

  it("5. удаление всех сессий даёт null", async () => {
    const { session, taskId, morning, noon } = await taskWithMorningAndNoonSessions();

    await deleteSession(session, noon.id, EVENING);
    await deleteSession(session, morning.id, EVENING);

    await expectLastStartedAt(session, taskId, null);
  });

  it("5. удаление идущей сессии возвращает lastStartedAt к предыдущей сессии", async () => {
    const { session, task } = await loginWithTask();
    await addSession(session, task.id, interval("10:00", "10:30"), atClock("11:00"));
    const running = await startTimer(session, task.id, atClock("12:00"));

    await deleteSession(session, running.id, atClock("12:30"));

    expect(await getTask(session, task.id, atClock("12:30"))).toMatchObject({
      status: 200,
      body: { task: { lastStartedAt: clockIso("10:00") } },
    });
  });
});
