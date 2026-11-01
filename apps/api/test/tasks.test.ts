import { describe, expect, it } from "vitest";
import { ISO_TIME, expectApiError, expectValidationError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import { api, type TestResponse, type TestSession } from "./harness/index.ts";
import {
  archiveProject,
  createArchivedProject,
  createProject,
  updateProject,
} from "./harness/projects.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { UUID, loginAs } from "./harness/session.ts";
import { archiveTask, createTask, expectTaskTitles, listTasks, taskPath } from "./harness/tasks.ts";

type ProjectIdFor = (owner: TestSession) => Promise<string>;

function postTask(session: TestSession, body: unknown): Promise<TestResponse> {
  return api.post("/api/tasks", body, { as: session });
}

function patchTask(session: TestSession, id: string, body: unknown): Promise<TestResponse> {
  return api.patch(taskPath(id), body, { as: session });
}

function getTask(session: TestSession, id: string): Promise<TestResponse> {
  return api.get(taskPath(id), { as: session });
}

async function foreignProjectId(): Promise<string> {
  const stranger = await loginAs({ telegramId: 2 });
  const project = await createProject(stranger.session, { name: "Чужой" });
  return project.id;
}

async function archivedProjectId(owner: TestSession): Promise<string> {
  const project = await createArchivedProject(owner, "Архивный");
  return project.id;
}

const invalidProjectIds: [string, ProjectIdFor][] = [
  ["чужого проекта", foreignProjectId],
  ["архивного проекта", archivedProjectId],
  ["несуществующего проекта", () => Promise.resolve(MISSING_ID)],
  ["с неверным синтаксисом", () => Promise.resolve("not-a-uuid")],
];

describe("POST /api/tasks", () => {
  it("6. задача без проекта: 201, projectId null, пробелы по краям названия обрезаны", async () => {
    const { session } = await loginAs();

    expect(await postTask(session, { title: "  Anki  " })).toMatchObject({
      status: 201,
      body: {
        task: {
          id: expect.stringMatching(UUID),
          title: "Anki",
          projectId: null,
          archived: false,
          createdAt: expect.stringMatching(ISO_TIME),
          updatedAt: expect.stringMatching(ISO_TIME),
        },
      },
    });
  });

  it("6. задача с projectId null создаётся без проекта", async () => {
    const { session } = await loginAs();

    expect(await postTask(session, { title: "Anki", projectId: null })).toMatchObject({
      status: 201,
      body: { task: { title: "Anki", projectId: null } },
    });
  });

  it("6. задача создаётся в своём проекте", async () => {
    const { session } = await loginAs();
    const project = await createProject(session, { name: "Спорт" });

    expect(
      await postTask(session, { title: "Беговая дорожка", projectId: project.id }),
    ).toMatchObject({
      status: 201,
      body: { task: { title: "Беговая дорожка", projectId: project.id } },
    });
  });

  it("6. созданная задача возвращается по GET /api/tasks/:id", async () => {
    const { session } = await loginAs();
    const task = await createTask(session, { title: "Anki" });

    expect(await getTask(session, task.id)).toMatchObject({ status: 200, body: { task } });
  });

  it.each([
    ["из пробелов", "   "],
    ["длиннее 300 символов", "я".repeat(301)],
  ])("6. название %s даёт 400 с полем title", async (_, title) => {
    const { session } = await loginAs();

    expectValidationError(await postTask(session, { title }), ["title"]);
  });

  it("6. без названия ответ 400 с полем title", async () => {
    const { session } = await loginAs();

    expectValidationError(await postTask(session, { projectId: null }), ["title"]);
  });

  it("6. название из 300 символов принимается", async () => {
    const { session } = await loginAs();
    const title = "я".repeat(300);

    expect(await postTask(session, { title })).toMatchObject({
      status: 201,
      body: { task: { title } },
    });
  });

  it("6. одинаковые названия задач допустимы", async () => {
    const { session } = await loginAs();
    await createTask(session, { title: "Бег" });

    expect(await postTask(session, { title: "Бег" })).toMatchObject({ status: 201 });
    expectTaskTitles(await listTasks(session), ["Бег", "Бег"]);
  });
});

describe("projectId в теле задачи", () => {
  it.each(invalidProjectIds)(
    "7. POST /api/tasks с projectId %s даёт 400 с полем projectId",
    async (_, projectIdFor) => {
      const { session } = await loginAs();
      const projectId = await projectIdFor(session);

      expectValidationError(await postTask(session, { title: "Бег", projectId }), ["projectId"]);
    },
  );

  it.each(invalidProjectIds)(
    "7. PATCH /api/tasks/:id с projectId %s даёт 400 с полем projectId",
    async (_, projectIdFor) => {
      const { session } = await loginAs();
      const task = await createTask(session, { title: "Бег" });
      const projectId = await projectIdFor(session);

      expectValidationError(await patchTask(session, task.id, { projectId }), ["projectId"]);
    },
  );
});

describe("фильтры GET /api/tasks", () => {
  it("8. projectId=<id> возвращает задачи проекта, projectId=none возвращает задачи без проекта", async () => {
    const { session } = await loginAs();
    const sport = await createProject(session, { name: "Спорт" });
    const work = await createProject(session, { name: "Работа" });
    await createTask(session, { title: "Отжимания", projectId: sport.id });
    await createTask(session, { title: "Бег", projectId: sport.id });
    await createTask(session, { title: "Отчёт", projectId: work.id });
    await createTask(session, { title: "Анкета" });

    expectTaskTitles(await listTasks(session, { projectId: sport.id }), ["Бег", "Отжимания"]);
    expectTaskTitles(await listTasks(session, { projectId: "none" }), ["Анкета"]);
  });

  it("8. q=АНК находит «Анкета» и «Банк», но не «Anki»", async () => {
    const { session } = await loginAs();
    for (const title of ["Anki", "Банк", "Анкета"]) {
      await createTask(session, { title });
    }

    expectTaskTitles(await listTasks(session, { q: "АНК" }), ["Анкета", "Банк"]);
  });

  it("8. задача архивного проекта не видна при archived=false и видна при archived=true", async () => {
    const { session } = await loginAs();
    const sport = await createProject(session, { name: "Спорт" });
    await createTask(session, { title: "Бег", projectId: sport.id });
    await createTask(session, { title: "Анкета" });
    await archiveProject(session, sport.id);

    expectTaskTitles(await listTasks(session), ["Анкета"]);
    expectTaskTitles(await listTasks(session, { archived: "false" }), ["Анкета"]);
    expectTaskTitles(await listTasks(session, { archived: "true" }), ["Бег"]);
    expectTaskTitles(await listTasks(session, { archived: "all" }), ["Анкета", "Бег"]);
  });

  it("8. после возврата проекта из архива его задачи снова видны при archived=false", async () => {
    const { session } = await loginAs();
    const sport = await createProject(session, { name: "Спорт" });
    await createTask(session, { title: "Бег", projectId: sport.id });
    await archiveProject(session, sport.id);
    await updateProject(session, sport.id, { archived: false });

    expectTaskTitles(await listTasks(session), ["Бег"]);
    expectTaskTitles(await listTasks(session, { archived: "true" }), []);
  });

  it("8. архивная задача не видна при archived=false и видна при archived=true и all", async () => {
    const { session } = await loginAs();
    const task = await createTask(session, { title: "Бег" });
    await createTask(session, { title: "Анкета" });
    await archiveTask(session, task.id);

    expectTaskTitles(await listTasks(session), ["Анкета"]);
    expectTaskTitles(await listTasks(session, { archived: "true" }), ["Бег"]);
    expectTaskTitles(await listTasks(session, { archived: "all" }), ["Анкета", "Бег"]);
  });

  it("8. архивная задача возвращается по GET /api/tasks/:id", async () => {
    const { session } = await loginAs();
    const task = await createTask(session, { title: "Бег" });
    await archiveTask(session, task.id);

    expect(await getTask(session, task.id)).toMatchObject({
      status: 200,
      body: { task: { id: task.id, title: "Бег", archived: true } },
    });
  });

  it("8. archived=maybe даёт 400 validation_error", async () => {
    const { session } = await loginAs();

    expectApiError(await listTasks(session, { archived: "maybe" }), "validation_error");
  });

  it("8. список задач отсортирован по названию без учёта регистра", async () => {
    const { session } = await loginAs();
    for (const title of ["Яблоко", "бег", "ёлка", "Альфа", "Вода"]) {
      await createTask(session, { title });
    }

    expectTaskTitles(await listTasks(session), ["Альфа", "бег", "Вода", "ёлка", "Яблоко"]);
  });

  it("8. названия, равные без учёта регистра, идут по createdAt", async () => {
    const { session } = await loginAs({}, atMinute(0));
    await createTask(session, { title: "ЗАДАЧА" }, atMinute(1));
    await createTask(session, { title: "Задача" }, atMinute(2));
    await createTask(session, { title: "задача" }, atMinute(3));

    expectTaskTitles(await listTasks(session, {}, atMinute(4)), ["ЗАДАЧА", "Задача", "задача"]);
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("9. меняет название и проект, пробелы по краям обрезаны, updatedAt растёт", async () => {
    const { session } = await loginAs({}, atMinute(0));
    const sport = await createProject(session, { name: "Спорт" }, atMinute(1));
    const task = await createTask(session, { title: "Бег" }, atMinute(1));
    const response = await api.patch(
      taskPath(task.id),
      { title: "  Беговая дорожка  ", projectId: sport.id },
      { as: session, ...atMinute(2) },
    );

    expect(response).toMatchObject({
      status: 200,
      body: { task: { id: task.id, title: "Беговая дорожка", projectId: sport.id } },
    });
    expect(Date.parse(response.body.task.updatedAt)).toBeGreaterThan(Date.parse(task.updatedAt));
  });

  it("9. изменения видны в GET /api/tasks/:id", async () => {
    const { session } = await loginAs();
    const sport = await createProject(session, { name: "Спорт" });
    const task = await createTask(session, { title: "Бег" });
    await patchTask(session, task.id, { title: "Беговая дорожка", projectId: sport.id });

    expect(await getTask(session, task.id)).toMatchObject({
      status: 200,
      body: { task: { title: "Беговая дорожка", projectId: sport.id } },
    });
  });

  it("9. projectId null убирает задачу из проекта", async () => {
    const { session } = await loginAs();
    const sport = await createProject(session, { name: "Спорт" });
    const task = await createTask(session, { title: "Бег", projectId: sport.id });

    expect(await patchTask(session, task.id, { projectId: null })).toMatchObject({
      status: 200,
      body: { task: { id: task.id, projectId: null } },
    });
  });

  it.each([{}, { name: "Бег" }])(
    "9. тело %j без известных полей даёт 400 validation_error",
    async (body) => {
      const { session } = await loginAs();
      const task = await createTask(session, { title: "Бег" });

      expectApiError(await patchTask(session, task.id, body), "validation_error");
    },
  );

  it("9. название из пробелов даёт 400 с полем title", async () => {
    const { session } = await loginAs();
    const task = await createTask(session, { title: "Бег" });

    expectValidationError(await patchTask(session, task.id, { title: "   " }), ["title"]);
  });
});
