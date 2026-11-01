import { describe, expect, it } from "vitest";
import { atSecond } from "./harness/clock.ts";
import { createProject, getProject, listProjects } from "./harness/projects.ts";
import { loginAs } from "./harness/session.ts";
import { archiveTask, createTask, getTask, listTasks } from "./harness/tasks.ts";
import { getTimerSession, loginWithTask, recordSession, startTimer } from "./harness/timers.ts";

describe("totalSec задачи", () => {
  it("10. две сессии по 60 и 120 секунд плюс идущая 30 секунд дают totalSec 210", async () => {
    const { session, task } = await loginWithTask();
    await recordSession(session, task.id, 0, 60);
    await recordSession(session, task.id, 100, 220);
    const running = await startTimer(session, task.id, atSecond(300));

    expect(await getTask(session, task.id, atSecond(330))).toMatchObject({
      status: 200,
      body: { task: { totalSec: 210, runningSessionId: running.id } },
    });
    expect(await getTimerSession(session, running.id, atSecond(330))).toMatchObject({
      status: 200,
      body: { session: { id: running.id, endedAt: null, durationSec: 30 } },
    });
  });

  it("10. totalSec виден и в списке задач", async () => {
    const { session, task } = await loginWithTask();
    await recordSession(session, task.id, 0, 60);
    await recordSession(session, task.id, 100, 220);
    await startTimer(session, task.id, atSecond(300));

    expect(await listTasks(session, {}, atSecond(330))).toMatchObject({
      status: 200,
      body: { tasks: [{ id: task.id, totalSec: 210 }] },
    });
  });
});

describe("totalSec проекта", () => {
  it("11. totalSec проекта равен сумме totalSec его задач, включая архивные и идущие", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const inSport = { projectId: sport.id };
    const run = await createTask(session, { title: "Бег", ...inSport }, atSecond(0));
    const pushUps = await createTask(session, { title: "Отжимания", ...inSport }, atSecond(0));
    const stretching = await createTask(session, { title: "Растяжка", ...inSport }, atSecond(0));
    const anki = await createTask(session, { title: "Anki" }, atSecond(0));
    await recordSession(session, run.id, 0, 60);
    await recordSession(session, stretching.id, 0, 45);
    await archiveTask(session, stretching.id, atSecond(50));
    await recordSession(session, anki.id, 0, 100);
    await startTimer(session, pushUps.id, atSecond(70));

    expect(await getProject(session, sport.id, atSecond(100))).toMatchObject({
      status: 200,
      body: { project: { totalSec: 60 + 45 + 30 } },
    });
    expect(await listProjects(session, {}, atSecond(100))).toMatchObject({
      status: 200,
      body: { projects: [{ name: "Спорт", totalSec: 60 + 45 + 30 }] },
    });
  });

  it("11. у проекта без сессий totalSec 0", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));

    expect(await getProject(session, sport.id, atSecond(10))).toMatchObject({
      status: 200,
      body: { project: { totalSec: 0 } },
    });
  });
});
