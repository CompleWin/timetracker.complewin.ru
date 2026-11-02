import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atClock, atSecond } from "./harness/clock.ts";
import {
  EVENING,
  addSession,
  deleteSession,
  expectTaskSessionIds,
  interval,
  requestAddSession,
  requestDeleteSession,
} from "./harness/manual-sessions.ts";
import { createProject, getProject } from "./harness/projects.ts";
import { loginAs } from "./harness/session.ts";
import { createTask, getTask } from "./harness/tasks.ts";
import {
  getActiveTimers,
  getTimerSession,
  loginWithTask,
  requestStart,
  startTimer,
} from "./harness/timers.ts";

describe("DELETE /api/sessions/:id", () => {
  it("9. удаление отвечает 204, после чего GET /api/sessions/:id даёт 404", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);

    expect(await requestDeleteSession(session, stopped.id, EVENING)).toMatchObject({
      status: 204,
    });
    expectApiError(await getTimerSession(session, stopped.id, EVENING), "not_found");
  });

  it("9. удалённая сессия не видна в списке сессий и не входит в totalSec задачи и проекта", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));
    const removed = await addSession(session, run.id, interval("10:00", "10:40"), EVENING);
    const kept = await addSession(session, run.id, interval("11:00", "11:20"), EVENING);

    await deleteSession(session, removed.id, EVENING);

    await expectTaskSessionIds(session, run.id, [kept], EVENING);
    expect(await getTask(session, run.id, EVENING)).toMatchObject({
      status: 200,
      body: { task: { totalSec: 1200 } },
    });
    expect(await getProject(session, sport.id, EVENING)).toMatchObject({
      status: 200,
      body: { project: { totalSec: 1200 } },
    });
  });

  it("9. удаление идущей сессии убирает её из активных и отменяет таймер", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("12:00"));

    expect(await requestDeleteSession(session, running.id, atClock("12:30"))).toMatchObject({
      status: 204,
    });

    expect(await getActiveTimers(session, atClock("12:30"))).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
    expect(await getTask(session, task.id, atClock("12:30"))).toMatchObject({
      status: 200,
      body: { task: { runningSessionId: null, totalSec: 0 } },
    });
    expectApiError(await getTimerSession(session, running.id, atClock("12:30")), "not_found");
    await expectTaskSessionIds(session, task.id, [], atClock("12:30"));
  });

  it("9. после удаления идущей сессии таймер задачи снова запускается", async () => {
    const { session, task } = await loginWithTask();
    const running = await startTimer(session, task.id, atClock("12:00"));
    await deleteSession(session, running.id, atClock("12:30"));

    expect(await requestStart(session, task.id, atClock("12:40"))).toMatchObject({
      status: 201,
    });
  });

  it("9. повторное удаление даёт 404 not_found", async () => {
    const { session, task } = await loginWithTask();
    const stopped = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);
    await deleteSession(session, stopped.id, EVENING);

    expectApiError(await requestDeleteSession(session, stopped.id, EVENING), "not_found");
  });

  it("9. удалённая сессия не мешает новой сессии в том же интервале", async () => {
    const { session, task } = await loginWithTask();
    const removed = await addSession(session, task.id, interval("10:00", "10:40"), EVENING);
    await deleteSession(session, removed.id, EVENING);

    expect(
      await requestAddSession(session, task.id, interval("10:00", "10:40"), EVENING),
    ).toMatchObject({ status: 201 });
  });
});
