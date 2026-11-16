import { describe, expect, it } from "vitest";
import { atMinute, atSecond } from "./harness/clock.ts";
import { runCron } from "./harness/index.ts";
import {
  addSession,
  deleteSession,
  expectStoredTimes,
  expectTaskSessionIds,
} from "./harness/manual-sessions.ts";
import { createTask, getTask } from "./harness/tasks.ts";
import { fakeBot, loginWithBotAccess } from "./harness/telegram-bot.ts";
import {
  getTaskSessions,
  loginWithTask,
  recordSession,
  requestStart,
  startTimer,
  stopTimer,
  type TestTimerSession,
  type UserWithTask,
} from "./harness/timers.ts";

type TaskWithStoppedSession = UserWithTask & { stopped: TestTimerSession };

const NOTE = "прочитал главу";
const MINUTE_SEC = 60;

async function taskWithSessionUntilMinute(): Promise<TaskWithStoppedSession> {
  const { session, task } = await loginWithTask();
  const stopped = await recordSession(session, task.id, 0, 60);
  return { session, task, stopped };
}

function continuedResponse(stopped: TestTimerSession): Record<string, unknown> {
  const { id, taskId, startedAt } = stopped;
  return { status: 201, body: { session: { id, taskId, startedAt, endedAt: null } } };
}

describe("запуск таймера сразу после остановки", () => {
  it.each([
    ["1. запуск через 40 с", 100],
    ["2. запуск через ровно 60 с", 120],
  ])(
    "%s продолжает остановленную сессию: 201 с её id и startedAt, endedAt null, у задачи одна сессия",
    async (_, startSecond) => {
      const { session, task, stopped } = await taskWithSessionUntilMinute();

      expect(await requestStart(session, task.id, atSecond(startSecond))).toMatchObject(
        continuedResponse(stopped),
      );
      await expectTaskSessionIds(session, task.id, [stopped], atSecond(startSecond));
    },
  );

  it("1. у задачи runningSessionId равен id продолженной сессии", async () => {
    const { session, task, stopped } = await taskWithSessionUntilMinute();
    await startTimer(session, task.id, atSecond(100));

    expect(await getTask(session, task.id, atSecond(110))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: stopped.id } },
    });
  });

  it("3. запуск через 61 с создаёт новую сессию, у задачи две сессии", async () => {
    const { session, task, stopped } = await taskWithSessionUntilMinute();

    const response = await requestStart(session, task.id, atSecond(121));

    expect(response).toMatchObject({
      status: 201,
      body: { session: { startedAt: atSecond(121).now, endedAt: null } },
    });
    expect(response.body.session.id).not.toBe(stopped.id);
    await expectTaskSessionIds(session, task.id, [response.body.session, stopped], atSecond(130));
  });

  it("4. остановка продолженной сессии в 300 с даёт сессию 0–300 с, durationSec 300 и totalSec задачи 300", async () => {
    const { session, task, stopped } = await taskWithSessionUntilMinute();
    await startTimer(session, task.id, atSecond(100));

    expect(await stopTimer(session, task.id, atSecond(300))).toMatchObject({
      id: stopped.id,
      startedAt: atSecond(0).now,
      endedAt: atSecond(300).now,
      durationSec: 300,
    });
    expect(await getTask(session, task.id, atSecond(310))).toMatchObject({
      status: 200,
      body: { task: { totalSec: 300 } },
    });
  });

  it("5. продолженная сессия сохраняет заметку «прочитал главу»", async () => {
    const { session, task } = await loginWithTask();
    const times = { startedAt: atSecond(0).now, endedAt: atSecond(60).now, note: NOTE };
    const stopped = await addSession(session, task.id, times, atSecond(60));

    expect(await requestStart(session, task.id, atSecond(100))).toMatchObject({
      status: 201,
      body: { session: { id: stopped.id, endedAt: null, note: NOTE } },
    });
  });

  it("6. сессия другой задачи, кончившаяся в 60 с, не продолжается и не меняется", async () => {
    const { session, task } = await loginWithTask();
    const other = await createTask(session, { title: "Беговая дорожка" }, atSecond(0));
    const otherSession = await recordSession(session, other.id, 0, 60);

    const started = await startTimer(session, task.id, atSecond(100));

    expect(started).toMatchObject({ taskId: task.id, startedAt: atSecond(100).now });
    expect(started.id).not.toBe(otherSession.id);
    await expectStoredTimes(session, otherSession, atSecond(110));
    await expectTaskSessionIds(session, other.id, [otherSession], atSecond(110));
  });

  it("7. удалённая сессия задачи 0–60 с не продолжается: запуск в 100 с создаёт новую сессию", async () => {
    const { session, task, stopped } = await taskWithSessionUntilMinute();
    await deleteSession(session, stopped.id, atSecond(70));

    const started = await startTimer(session, task.id, atSecond(100));

    expect(started).toMatchObject({ startedAt: atSecond(100).now, endedAt: null });
    expect(started.id).not.toBe(stopped.id);
    expect(await getTaskSessions(session, task.id, {}, atSecond(110))).toMatchObject({
      status: 200,
      body: { sessions: [{ id: started.id }] },
    });
  });
});

describe("напоминание о продолженной сессии", () => {
  it("8. сессия 3 ч 10 мин с напоминанием остановлена и через 30 с запущена снова: следующий cron отправляет новое напоминание", async () => {
    const bot = fakeBot();
    const { session } = await loginWithBotAccess();
    const task = await createTask(session, { title: "Anki" }, atSecond(0));
    const anki = await startTimer(session, task.id, atSecond(0));
    await runCron(atMinute(180).now);
    expect(bot.sentMessages()).toHaveLength(1);
    await stopTimer(session, task.id, atMinute(190));

    const resumed = await startTimer(session, task.id, atSecond(190 * MINUTE_SEC + 30));
    bot.forget();
    await runCron(atMinute(191).now);

    expect(resumed).toMatchObject({ id: anki.id, startedAt: anki.startedAt });
    expect(bot.sentMessages()).toMatchObject([
      {
        text: "⏰ «Anki» идёт уже 3:11:00. Остановить?",
        keyboard: [
          [{ callback_data: `stop:${anki.id}` }],
          [{ callback_data: `snooze:${anki.id}` }],
        ],
      },
    ]);
  });
});
