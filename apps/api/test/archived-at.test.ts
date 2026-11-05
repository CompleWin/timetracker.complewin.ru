import { describe, expect, it } from "vitest";
import { atClock, atSecond, clockIso } from "./harness/clock.ts";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  updateProject,
} from "./harness/projects.ts";
import { loginAs } from "./harness/session.ts";
import { archiveTask, createTask, getTask, listTasks, updateTask } from "./harness/tasks.ts";
import { loginWithTask } from "./harness/timers.ts";

const ARCHIVED_AT = atClock("10:00");
const LATER = atClock("11:00");
const EVEN_LATER = atClock("12:00");

describe("archivedAt задачи", () => {
  it("7. PATCH { archived: true } с X-Test-Now T даёт archivedAt T", async () => {
    const { session, task } = await loginWithTask();

    expect(await archiveTask(session, task.id, ARCHIVED_AT)).toMatchObject({
      archived: true,
      archivedAt: clockIso("10:00"),
    });
    expect(await getTask(session, task.id, LATER)).toMatchObject({
      status: 200,
      body: { task: { archivedAt: clockIso("10:00") } },
    });
    expect(await listTasks(session, { archived: "true" }, LATER)).toMatchObject({
      status: 200,
      body: { tasks: [{ id: task.id, archivedAt: clockIso("10:00") }] },
    });
  });

  it("7. повторный PATCH { archived: true } позже оставляет archivedAt прежним", async () => {
    const { session, task } = await loginWithTask();
    await archiveTask(session, task.id, ARCHIVED_AT);

    expect(await archiveTask(session, task.id, LATER)).toMatchObject({
      archivedAt: clockIso("10:00"),
    });
  });

  it("7. PATCH { archived: false } даёт archivedAt null", async () => {
    const { session, task } = await loginWithTask();
    await archiveTask(session, task.id, ARCHIVED_AT);

    expect(await updateTask(session, task.id, { archived: false }, LATER)).toMatchObject({
      archived: false,
      archivedAt: null,
    });
  });

  it("7. после возврата из архива новая архивация ставит новое время", async () => {
    const { session, task } = await loginWithTask();
    await archiveTask(session, task.id, ARCHIVED_AT);
    await updateTask(session, task.id, { archived: false }, LATER);

    expect(await archiveTask(session, task.id, EVEN_LATER)).toMatchObject({
      archivedAt: clockIso("12:00"),
    });
  });

  it("7. у задачи, чей проект ушёл в архив, archivedAt null", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    const run = await createTask(session, { title: "Бег", projectId: sport.id }, atSecond(0));

    await archiveProject(session, sport.id, ARCHIVED_AT);

    expect(await getTask(session, run.id, LATER)).toMatchObject({
      status: 200,
      body: { task: { archived: false, archivedAt: null } },
    });
  });
});

describe("archivedAt проекта", () => {
  it("7. PATCH { archived: true } с X-Test-Now T даёт archivedAt T", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));

    expect(await archiveProject(session, sport.id, ARCHIVED_AT)).toMatchObject({
      archived: true,
      archivedAt: clockIso("10:00"),
    });
    expect(await getProject(session, sport.id, LATER)).toMatchObject({
      status: 200,
      body: { project: { archivedAt: clockIso("10:00") } },
    });
    expect(await listProjects(session, { archived: "true" }, LATER)).toMatchObject({
      status: 200,
      body: { projects: [{ id: sport.id, archivedAt: clockIso("10:00") }] },
    });
  });

  it("7. повторный PATCH { archived: true } позже оставляет archivedAt прежним", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    await archiveProject(session, sport.id, ARCHIVED_AT);

    expect(await archiveProject(session, sport.id, LATER)).toMatchObject({
      archivedAt: clockIso("10:00"),
    });
  });

  it("7. PATCH { archived: false } даёт archivedAt null", async () => {
    const { session } = await loginAs({}, atSecond(0));
    const sport = await createProject(session, { name: "Спорт" }, atSecond(0));
    await archiveProject(session, sport.id, ARCHIVED_AT);

    expect(await updateProject(session, sport.id, { archived: false }, LATER)).toMatchObject({
      archived: false,
      archivedAt: null,
    });
  });
});
