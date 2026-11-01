import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api, type TestResponse, type TestSession } from "./harness/index.ts";
import {
  createProject,
  expectProjectNames,
  listProjects,
  projectPath,
  type TestProject,
} from "./harness/projects.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";
import {
  createTask,
  expectTaskTitles,
  listTasks,
  taskPath,
  type TestTask,
} from "./harness/tasks.ts";

type OwnedData = {
  owner: TestSession;
  project: TestProject;
  task: TestTask;
};

async function ownerWithProjectAndTask(): Promise<OwnedData> {
  const { session: owner } = await loginAs({ telegramId: 1 });
  const project = await createProject(owner, { name: "Работа" });
  const task = await createTask(owner, { title: "Отчёт", projectId: project.id });
  return { owner, project, task };
}

async function stranger(): Promise<TestSession> {
  const { session } = await loginAs({ telegramId: 2 });
  return session;
}

const endpointsWithoutSession: [string, () => Promise<TestResponse>][] = [
  ["GET /api/projects", () => api.get("/api/projects")],
  ["POST /api/projects", () => api.post("/api/projects", { name: "Работа" })],
  ["GET /api/projects/:id", () => api.get(projectPath(MISSING_ID))],
  ["PATCH /api/projects/:id", () => api.patch(projectPath(MISSING_ID), { name: "Работа" })],
  ["GET /api/tasks", () => api.get("/api/tasks")],
  ["POST /api/tasks", () => api.post("/api/tasks", { title: "Отчёт" })],
  ["GET /api/tasks/:id", () => api.get(taskPath(MISSING_ID))],
  ["PATCH /api/tasks/:id", () => api.patch(taskPath(MISSING_ID), { title: "Отчёт" })],
];

describe("чужие проекты и задачи", () => {
  it("10. GET чужого проекта даёт 404 not_found", async () => {
    const { project } = await ownerWithProjectAndTask();

    expectApiError(await api.get(projectPath(project.id), { as: await stranger() }), "not_found");
  });

  it("10. PATCH чужого проекта даёт 404 not_found и не меняет его", async () => {
    const { owner, project } = await ownerWithProjectAndTask();
    const response = await api.patch(
      projectPath(project.id),
      { name: "Чужое" },
      { as: await stranger() },
    );

    expectApiError(response, "not_found");
    expect(await api.get(projectPath(project.id), { as: owner })).toMatchObject({
      status: 200,
      body: { project: { name: "Работа" } },
    });
  });

  it("10. GET чужой задачи даёт 404 not_found", async () => {
    const { task } = await ownerWithProjectAndTask();

    expectApiError(await api.get(taskPath(task.id), { as: await stranger() }), "not_found");
  });

  it("10. PATCH чужой задачи даёт 404 not_found и не меняет её", async () => {
    const { owner, task } = await ownerWithProjectAndTask();
    const response = await api.patch(
      taskPath(task.id),
      { title: "Чужое" },
      { as: await stranger() },
    );

    expectApiError(response, "not_found");
    expect(await api.get(taskPath(task.id), { as: owner })).toMatchObject({
      status: 200,
      body: { task: { title: "Отчёт" } },
    });
  });

  it("10. чужие проекты и задачи не попадают в списки", async () => {
    await ownerWithProjectAndTask();
    const session = await stranger();
    const own = await createProject(session, { name: "Личное" });
    await createTask(session, { title: "Дневник", projectId: own.id });

    expectProjectNames(await listProjects(session, { archived: "all" }), ["Личное"]);
    expectTaskTitles(await listTasks(session, { archived: "all" }), ["Дневник"]);
    expectTaskTitles(await listTasks(session, { q: "Отчёт" }), []);
  });

  it.each([
    ["несуществующий", MISSING_ID],
    ["синтаксически неверный", "not-a-uuid"],
  ])("10. %s ID проекта и задачи даёт 404 на GET и PATCH", async (_, id) => {
    const { session } = await loginAs();

    expectApiError(await api.get(projectPath(id), { as: session }), "not_found");
    expectApiError(
      await api.patch(projectPath(id), { name: "Работа" }, { as: session }),
      "not_found",
    );
    expectApiError(await api.get(taskPath(id), { as: session }), "not_found");
    expectApiError(await api.patch(taskPath(id), { title: "Отчёт" }, { as: session }), "not_found");
  });
});

describe("без сессии", () => {
  it.each(endpointsWithoutSession)(
    "11. %s без сессии возвращает 401 unauthorized",
    async (_, send) => {
      expectApiError(await send(), "unauthorized");
    },
  );
});
