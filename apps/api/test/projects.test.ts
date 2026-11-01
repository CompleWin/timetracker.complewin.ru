import { describe, expect, it } from "vitest";
import { ISO_TIME, expectApiError, expectValidationError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import { api, type TestResponse, type TestSession } from "./harness/index.ts";
import {
  PROJECT_COLORS,
  createArchivedProject,
  createProject,
  expectProjectNames,
  listProjects,
  projectPath,
} from "./harness/projects.ts";
import { UUID, loginAs } from "./harness/session.ts";

function postProject(session: TestSession, body: unknown): Promise<TestResponse> {
  return api.post("/api/projects", body, { as: session });
}

function patchProject(session: TestSession, id: string, body: unknown): Promise<TestResponse> {
  return api.patch(projectPath(id), body, { as: session });
}

function getProject(session: TestSession, id: string): Promise<TestResponse> {
  return api.get(projectPath(id), { as: session });
}

describe("POST /api/projects", () => {
  it("1. создаёт проект: 201, пробелы по краям названия обрезаны, color по умолчанию default", async () => {
    const { session } = await loginAs();

    expect(await postProject(session, { name: "  Работа  " })).toMatchObject({
      status: 201,
      body: {
        project: {
          id: expect.stringMatching(UUID),
          name: "Работа",
          color: "default",
          archived: false,
          createdAt: expect.stringMatching(ISO_TIME),
          updatedAt: expect.stringMatching(ISO_TIME),
        },
      },
    });
  });

  it("1. созданный проект возвращается по GET /api/projects/:id", async () => {
    const { session } = await loginAs();
    const project = await createProject(session, { name: "Работа" });

    expect(await getProject(session, project.id)).toMatchObject({ status: 200, body: { project } });
  });

  it.each(PROJECT_COLORS)("1. color %s сохраняется", async (color) => {
    const { session } = await loginAs();

    expect(await postProject(session, { name: "Работа", color })).toMatchObject({
      status: 201,
      body: { project: { color } },
    });
  });

  it.each([
    ["из пробелов", "   "],
    ["длиннее 100 символов", "я".repeat(101)],
  ])("2. название %s даёт 400 с полем name", async (_, name) => {
    const { session } = await loginAs();

    expectValidationError(await postProject(session, { name }), ["name"]);
  });

  it("2. без названия ответ 400 с полем name", async () => {
    const { session } = await loginAs();

    expectValidationError(await postProject(session, { color: "green" }), ["name"]);
  });

  it("2. название из 100 символов принимается", async () => {
    const { session } = await loginAs();
    const name = "я".repeat(100);

    expect(await postProject(session, { name })).toMatchObject({
      status: 201,
      body: { project: { name } },
    });
  });

  it.each(["black", "Green", ""])(
    "2. неизвестный color %j даёт 400 с полем color",
    async (color) => {
      const { session } = await loginAs();

      expectValidationError(await postProject(session, { name: "Работа", color }), ["color"]);
    },
  );

  it("4. невалидный JSON даёт 400 validation_error, проект не создаётся", async () => {
    const { session } = await loginAs();

    expectApiError(await postProject(session, '{"name": "Работа"'), "validation_error");
    expectProjectNames(await listProjects(session, { archived: "all" }), []);
  });
});

describe("уникальность названия проекта", () => {
  it("3. «Работа» и «работа» среди неархивных проектов дают 409 name_taken", async () => {
    const { session } = await loginAs();
    await createProject(session, { name: "Работа" });

    expectApiError(await postProject(session, { name: "работа" }), "name_taken");
  });

  it("3. после архивации «Работа» проект «работа» создаётся", async () => {
    const { session } = await loginAs();
    await createArchivedProject(session, "Работа");

    expect(await postProject(session, { name: "работа" })).toMatchObject({
      status: 201,
      body: { project: { name: "работа" } },
    });
  });

  it("3. вернуть «Работа» из архива при неархивном «работа» нельзя: 409 name_taken, проект остаётся в архиве", async () => {
    const { session } = await loginAs();
    const first = await createArchivedProject(session, "Работа");
    await createProject(session, { name: "работа" });

    expectApiError(await patchProject(session, first.id, { archived: false }), "name_taken");
    expect(await getProject(session, first.id)).toMatchObject({
      status: 200,
      body: { project: { archived: true } },
    });
  });

  it("3. проект возвращается из архива, если название свободно", async () => {
    const { session } = await loginAs();
    const project = await createArchivedProject(session, "Работа");

    expect(await patchProject(session, project.id, { archived: false })).toMatchObject({
      status: 200,
      body: { project: { id: project.id, archived: false } },
    });
  });

  it("3. переименование в занятое название даёт 409 name_taken", async () => {
    const { session } = await loginAs();
    await createProject(session, { name: "Работа" });
    const rest = await createProject(session, { name: "Отдых" });

    expectApiError(await patchProject(session, rest.id, { name: "работа" }), "name_taken");
  });

  it("3. у другого пользователя может быть проект с тем же названием", async () => {
    const owner = await loginAs({ telegramId: 1 });
    await createProject(owner.session, { name: "Работа" });
    const stranger = await loginAs({ telegramId: 2 });

    expect(await postProject(stranger.session, { name: "Работа" })).toMatchObject({
      status: 201,
      body: { project: { name: "Работа" } },
    });
  });
});

describe("GET /api/projects", () => {
  it("5. список отсортирован по названию без учёта регистра", async () => {
    const { session } = await loginAs();
    for (const name of ["Яблоко", "бег", "ёлка", "Альфа", "Вода"]) {
      await createProject(session, { name });
    }

    expectProjectNames(await listProjects(session), ["Альфа", "бег", "Вода", "ёлка", "Яблоко"]);
  });

  it("5. названия, равные без учёта регистра, идут по createdAt", async () => {
    const { session } = await loginAs({}, atMinute(0));
    await createArchivedProject(session, "РАБОТА", atMinute(1));
    await createArchivedProject(session, "Работа", atMinute(2));
    await createProject(session, { name: "работа" }, atMinute(3));

    expectProjectNames(await listProjects(session, { archived: "all" }, atMinute(4)), [
      "РАБОТА",
      "Работа",
      "работа",
    ]);
  });

  it("5. архивные проекты видны только с archived=true или all", async () => {
    const { session } = await loginAs();
    await createProject(session, { name: "Активный" });
    await createArchivedProject(session, "Архивный");

    expectProjectNames(await listProjects(session), ["Активный"]);
    expectProjectNames(await listProjects(session, { archived: "false" }), ["Активный"]);
    expectProjectNames(await listProjects(session, { archived: "true" }), ["Архивный"]);
    expectProjectNames(await listProjects(session, { archived: "all" }), ["Активный", "Архивный"]);
  });

  it("5. архивный проект возвращается по GET /api/projects/:id", async () => {
    const { session } = await loginAs();
    const project = await createArchivedProject(session, "Архивный");

    expect(await getProject(session, project.id)).toMatchObject({
      status: 200,
      body: { project: { id: project.id, name: "Архивный", archived: true } },
    });
  });

  it("5. archived=maybe даёт 400 validation_error", async () => {
    const { session } = await loginAs();

    expectApiError(await listProjects(session, { archived: "maybe" }), "validation_error");
  });
});

describe("PATCH /api/projects/:id", () => {
  it("9. меняет название и цвет, пробелы по краям обрезаны, updatedAt растёт", async () => {
    const { session } = await loginAs({}, atMinute(0));
    const project = await createProject(session, { name: "Работа" }, atMinute(1));
    const response = await api.patch(
      projectPath(project.id),
      { name: "  Отдых  ", color: "blue" },
      { as: session, ...atMinute(2) },
    );

    expect(response).toMatchObject({
      status: 200,
      body: { project: { id: project.id, name: "Отдых", color: "blue" } },
    });
    expect(Date.parse(response.body.project.updatedAt)).toBeGreaterThan(
      Date.parse(project.updatedAt),
    );
  });

  it.each([{}, { title: "Работа" }])(
    "9. тело %j без известных полей даёт 400 validation_error",
    async (body) => {
      const { session } = await loginAs();
      const project = await createProject(session, { name: "Работа" });

      expectApiError(await patchProject(session, project.id, body), "validation_error");
    },
  );

  it("2. название из пробелов даёт 400 с полем name", async () => {
    const { session } = await loginAs();
    const project = await createProject(session, { name: "Работа" });

    expectValidationError(await patchProject(session, project.id, { name: "   " }), ["name"]);
  });

  it("2. неизвестный color даёт 400 с полем color", async () => {
    const { session } = await loginAs();
    const project = await createProject(session, { name: "Работа" });

    expectValidationError(await patchProject(session, project.id, { color: "black" }), ["color"]);
  });
});
