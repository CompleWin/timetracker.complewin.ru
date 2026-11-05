import { describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import { api } from "./harness/index.ts";
import { loginAs } from "./harness/session.ts";
import {
  archiveTask,
  createTask,
  getTask,
  listTasks,
  taskPath,
  updateTask,
} from "./harness/tasks.ts";
import { loginWithTask } from "./harness/timers.ts";

describe("pinned задачи", () => {
  it("6. у новой задачи pinned false", async () => {
    const { session, task } = await loginWithTask();

    expect(task).toMatchObject({ pinned: false });
    expect(await getTask(session, task.id)).toMatchObject({
      status: 200,
      body: { task: { pinned: false } },
    });
  });

  it("6. PATCH { pinned: true } даёт pinned true и увеличивает updatedAt", async () => {
    const { session } = await loginAs({}, atMinute(0));
    const task = await createTask(session, { title: "Anki" }, atMinute(1));

    const response = await api.patch(
      taskPath(task.id),
      { pinned: true },
      { as: session, ...atMinute(2) },
    );

    expect(response).toMatchObject({
      status: 200,
      body: { task: { id: task.id, title: "Anki", pinned: true } },
    });
    expect(Date.parse(response.body.task.updatedAt)).toBeGreaterThan(Date.parse(task.updatedAt));
  });

  it("6. закреплённая задача видна в GET /api/tasks с pinned true", async () => {
    const { session, task } = await loginWithTask("Бег");
    await createTask(session, { title: "Чтение" });

    await updateTask(session, task.id, { pinned: true });

    expect(await listTasks(session)).toMatchObject({
      status: 200,
      body: {
        tasks: [
          { title: "Бег", pinned: true },
          { title: "Чтение", pinned: false },
        ],
      },
    });
  });

  it("6. PATCH { pinned: false } снимает закрепление", async () => {
    const { session, task } = await loginWithTask();
    await updateTask(session, task.id, { pinned: true });

    expect(await updateTask(session, task.id, { pinned: false })).toMatchObject({ pinned: false });
  });

  it("6. архивная задача сохраняет pinned", async () => {
    const { session, task } = await loginWithTask();
    await updateTask(session, task.id, { pinned: true });

    expect(await archiveTask(session, task.id)).toMatchObject({ archived: true, pinned: true });
  });

  it('6. PATCH { pinned: "yes" } даёт 400 с полем pinned', async () => {
    const { session, task } = await loginWithTask();

    expectValidationError(await api.patch(taskPath(task.id), { pinned: "yes" }, { as: session }), [
      "pinned",
    ]);
    expect(await getTask(session, task.id)).toMatchObject({
      status: 200,
      body: { task: { pinned: false } },
    });
  });
});
