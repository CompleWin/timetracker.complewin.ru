import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { atMinute, atSecond } from "./harness/clock.ts";
import { db } from "./harness/db.ts";
import { deleteSession } from "./harness/manual-sessions.ts";
import { listSessions } from "./harness/period-sessions.ts";
import { archiveProject, createProject, getProject } from "./harness/projects.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";
import {
  archiveTask,
  createTask,
  deleteTask,
  expectTaskTitles,
  getTask,
  listTasks,
  requestDeleteTask,
} from "./harness/tasks.ts";
import {
  getActiveTimers,
  getTimerSession,
  loginWithTask,
  recordSession,
  startTimer,
} from "./harness/timers.ts";

const CREATED_AT = atSecond(0);
const DELETED_AT = atMinute(60);

describe("DELETE /api/tasks/:id", () => {
  it("1. удаляет задачу и все строки её сессий, в том числе идущую и ранее удалённую", async () => {
    const { session, task } = await loginWithTask();
    const first = await recordSession(session, task.id, 0, 60);
    const second = await recordSession(session, task.id, 160, 220);
    const removed = await recordSession(session, task.id, 320, 380);
    await deleteSession(session, removed.id, atSecond(400));
    const running = await startTimer(session, task.id, atSecond(500));

    expect(await requestDeleteTask(session, task.id, DELETED_AT)).toMatchObject({
      status: 204,
      body: null,
    });

    expectApiError(await getTask(session, task.id, DELETED_AT), "not_found");
    for (const entry of [first, second, removed, running]) {
      expectApiError(await getTimerSession(session, entry.id, DELETED_AT), "not_found");
    }
    expect(await getActiveTimers(session, DELETED_AT)).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
    const period = { from: CREATED_AT.now, to: DELETED_AT.now };
    expect(await listSessions(session, period, DELETED_AT)).toMatchObject({
      status: 200,
      body: { sessions: [] },
    });
    for (const archived of ["false", "true", "all"]) {
      expectTaskTitles(await listTasks(session, { archived }, DELETED_AT), []);
    }
    expect(await db.all("SELECT id FROM tasks WHERE id = ?", task.id)).toEqual([]);
    expect(await db.all("SELECT id FROM time_entries WHERE task_id = ?", task.id)).toEqual([]);
  });

  it("2. удаляет архивную задачу", async () => {
    const { session, task } = await loginWithTask();
    await archiveTask(session, task.id, atMinute(10));
    expectTaskTitles(await listTasks(session, { archived: "true" }, atMinute(10)), [task.title]);

    await deleteTask(session, task.id, DELETED_AT);

    expectTaskTitles(await listTasks(session, { archived: "true" }, DELETED_AT), []);
  });

  it("2. удаляет задачу архивного проекта", async () => {
    const { session } = await loginAs({}, CREATED_AT);
    const project = await createProject(session, { name: "Учёба" }, CREATED_AT);
    const task = await createTask(session, { title: "Anki", projectId: project.id }, CREATED_AT);
    await archiveProject(session, project.id, atMinute(10));
    expectTaskTitles(await listTasks(session, { archived: "true" }, atMinute(10)), [task.title]);

    await deleteTask(session, task.id, DELETED_AT);

    expectTaskTitles(await listTasks(session, { archived: "true" }, DELETED_AT), []);
    expect(await getProject(session, project.id, DELETED_AT)).toMatchObject({
      status: 200,
      body: { project: { archived: true } },
    });
  });

  it("3. уменьшает totalSec проекта на время удалённой задачи", async () => {
    const { session } = await loginAs({}, CREATED_AT);
    const project = await createProject(session, { name: "Учёба" }, CREATED_AT);
    const anki = await createTask(session, { title: "Anki", projectId: project.id }, CREATED_AT);
    const reading = await createTask(
      session,
      { title: "Чтение", projectId: project.id },
      CREATED_AT,
    );
    await recordSession(session, anki.id, 0, 1800);
    await recordSession(session, reading.id, 0, 600);
    expect(await getProject(session, project.id, DELETED_AT)).toMatchObject({
      status: 200,
      body: { project: { totalSec: 2400 } },
    });

    await deleteTask(session, anki.id, DELETED_AT);

    expect(await getProject(session, project.id, DELETED_AT)).toMatchObject({
      status: 200,
      body: { project: { totalSec: 600 } },
    });
  });

  it("4. отсутствующая или уже удалённая задача даёт 404 not_found", async () => {
    const { session, task } = await loginWithTask();
    expectApiError(await requestDeleteTask(session, MISSING_ID, DELETED_AT), "not_found");

    await deleteTask(session, task.id, DELETED_AT);

    expectApiError(await requestDeleteTask(session, task.id, DELETED_AT), "not_found");
  });

  it("5. чужая задача даёт 404 not_found и остаётся у владельца", async () => {
    const owner = await loginAs({ telegramId: 111 }, CREATED_AT);
    const other = await loginAs({ telegramId: 222 }, CREATED_AT);
    const task = await createTask(owner.session, { title: "Anki" }, CREATED_AT);

    expectApiError(await requestDeleteTask(other.session, task.id, DELETED_AT), "not_found");
    expect(await getTask(owner.session, task.id, DELETED_AT)).toMatchObject({
      status: 200,
      body: { task: { id: task.id } },
    });
  });

  it("6. чужой Origin даёт 403 forbidden, задача остаётся", async () => {
    const { session, task } = await loginWithTask();

    expectApiError(
      await requestDeleteTask(session, task.id, {
        ...DELETED_AT,
        headers: { Origin: "https://other.example" },
      }),
      "forbidden",
    );
    expect(await getTask(session, task.id, DELETED_AT)).toMatchObject({
      status: 200,
      body: { task: { id: task.id } },
    });
  });
});
