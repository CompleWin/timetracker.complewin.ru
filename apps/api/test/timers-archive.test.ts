import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atSecond } from "./harness/clock.ts";
import { archiveProject, createProject } from "./harness/projects.ts";
import { loginAs } from "./harness/session.ts";
import { archiveTask, createTask, getTask } from "./harness/tasks.ts";
import {
  getActiveTimers,
  getTimerSession,
  loginWithTask,
  requestStart,
  startTimer,
} from "./harness/timers.ts";

describe("запуск неактивной задачи", () => {
  it("12. запуск архивной задачи даёт 409 task_archived", async () => {
    const { session, task } = await loginWithTask();
    await archiveTask(session, task.id, atSecond(10));

    expectApiError(await requestStart(session, task.id, atSecond(20)), "task_archived");
    expect(await getActiveTimers(session, atSecond(30))).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
  });

  it("12. запуск задачи архивного проекта даёт 409 task_archived", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));
    await archiveProject(session, sport.id, atSecond(10));

    expectApiError(await requestStart(session, run.id, atSecond(20)), "task_archived");
    expect(await getActiveTimers(session, atSecond(30))).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
  });
});

describe("архивация останавливает таймеры", () => {
  it("13. архивация задачи с идущим таймером останавливает его на «сейчас» запроса архивации", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atSecond(0));

    await archiveTask(session, task.id, atSecond(90));

    expect(await getTimerSession(session, running.id, atSecond(200))).toMatchObject({
      status: 200,
      body: { session: { id: running.id, endedAt: atSecond(90).now, durationSec: 90 } },
    });
    expect(await getTask(session, task.id, atSecond(200))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: null, totalSec: 90 } },
    });
    expect(await getActiveTimers(session, atSecond(200))).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
  });

  it("13. архивация проекта останавливает таймеры всех его задач на «сейчас» запроса архивации", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));
    const pushUps = await createTask(
      session,
      { title: "Отжимания", projectId: sport.id },
      atSecond(0),
    );
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    const runTimer = await startTimer(session, run.id, atSecond(0));
    const pushUpsTimer = await startTimer(session, pushUps.id, atSecond(30));
    const ankiTimer = await startTimer(session, anki.id, atSecond(0));

    await archiveProject(session, sport.id, atSecond(120));

    expect(await getTimerSession(session, runTimer.id, atSecond(200))).toMatchObject({
      status: 200,
      body: { session: { endedAt: atSecond(120).now, durationSec: 120 } },
    });
    expect(await getTimerSession(session, pushUpsTimer.id, atSecond(200))).toMatchObject({
      status: 200,
      body: { session: { endedAt: atSecond(120).now, durationSec: 90 } },
    });
    expect(await getActiveTimers(session, atSecond(200))).toMatchObject({
      status: 200,
      body: { sessions: [{ id: ankiTimer.id }] },
    });
  });
});
