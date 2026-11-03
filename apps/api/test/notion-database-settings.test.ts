import { beforeEach, describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import {
  addDatabase,
  connectedDatabases,
  defaultDatabaseIds,
  deleteDatabase,
  expectAddedFields,
  patchDatabase,
  updateDatabase,
} from "./harness/notion-databases.ts";
import { fakeNotionWorkspace, type FakeNotionWorkspace } from "./harness/notion-workspace.ts";
import { fakeNotion, loginWithNotion, onlyCall, type FakeNotion } from "./harness/notion.ts";
import { createProject, getProject } from "./harness/projects.ts";

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

describe("база по умолчанию", () => {
  it("12. вторая база с isDefault: true становится базой по умолчанию и снимает флаг с первой", async () => {
    const { session } = await loginWithNotion(notion);
    await addDatabase(session, workspace.dataSource({ title: ["Задачи"] }));
    const second = await addDatabase(session, workspace.dataSource({ title: ["Развлечения"] }), {
      isDefault: true,
    });

    expect(second).toMatchObject({ isDefault: true });
    expect(await defaultDatabaseIds(session)).toEqual([second.id]);
  });

  it("12. вторая база без isDefault не становится базой по умолчанию", async () => {
    const { session } = await loginWithNotion(notion);
    const first = await addDatabase(session, workspace.dataSource({ title: ["Задачи"] }));
    const second = await addDatabase(session, workspace.dataSource({ title: ["Развлечения"] }));

    expect(second).toMatchObject({ isDefault: false });
    expect(await defaultDatabaseIds(session)).toEqual([first.id]);
  });

  it("12. PATCH базы по умолчанию с isDefault: false оставляет пользователя без базы по умолчанию", async () => {
    const { session } = await loginWithNotion(notion);
    const first = await addDatabase(session, workspace.dataSource({ title: ["Задачи"] }));
    await addDatabase(session, workspace.dataSource({ title: ["Развлечения"] }));

    expect(await patchDatabase(session, first.id, { isDefault: false })).toMatchObject({
      status: 200,
      body: { database: { id: first.id, isDefault: false } },
    });
    expect(await defaultDatabaseIds(session)).toEqual([]);
  });

  it("12. PATCH с isDefault: true снимает флаг с прежней базы по умолчанию", async () => {
    const { session } = await loginWithNotion(notion);
    await addDatabase(session, workspace.dataSource({ title: ["Задачи"] }));
    const second = await addDatabase(session, workspace.dataSource({ title: ["Развлечения"] }));

    expect(await updateDatabase(session, second.id, { isDefault: true })).toMatchObject({
      isDefault: true,
    });
    expect(await defaultDatabaseIds(session)).toEqual([second.id]);
  });

  it("12. без базы по умолчанию следующая добавленная база становится ею", async () => {
    const { session } = await loginWithNotion(notion);
    const first = await addDatabase(session, workspace.dataSource({ title: ["Задачи"] }));
    await updateDatabase(session, first.id, { isDefault: false });
    const second = await addDatabase(session, workspace.dataSource({ title: ["Развлечения"] }));

    expect(second).toMatchObject({ isDefault: true });
    expect(await defaultDatabaseIds(session)).toEqual([second.id]);
  });
});

describe("PATCH /api/notion/databases/:id: режим проекта", () => {
  it("13. переход из none в own добавляет своё поле «Проект» одним PATCH к Notion", async () => {
    const { session } = await loginWithNotion(notion, { locale: "ru" });
    const tasks = workspace.dataSource();
    const database = await addDatabase(session, tasks, { projectMode: "none" });
    const updatesBefore = workspace.schemaUpdates(tasks).length;
    const response = await patchDatabase(session, database.id, { projectMode: "own" });

    expect(response).toMatchObject({
      status: 200,
      body: { database: { id: database.id, projectMode: "own", projectProperty: null } },
    });
    const updatesAfter = workspace.schemaUpdates(tasks).slice(updatesBefore);
    expectAddedFields(onlyCall(updatesAfter), "ru", ["project"]);
  });

  it("5. переход в property с полем select сохраняет projectProperty", async () => {
    const { session } = await loginWithNotion(notion);
    const tasks = workspace.dataSource({ properties: [{ name: "Направление", type: "select" }] });
    const database = await addDatabase(session, tasks, { projectMode: "none" });
    const area = workspace.property(tasks, "Направление");
    const changes = { projectMode: "property", projectPropertyId: area.id };

    expect(await patchDatabase(session, database.id, changes)).toMatchObject({
      status: 200,
      body: {
        database: {
          projectMode: "property",
          projectProperty: { id: area.id, name: "Направление", type: "select" },
        },
      },
    });
  });

  it("5. переход в property с полем типа number даёт 400 с полем projectPropertyId", async () => {
    const { session } = await loginWithNotion(notion);
    const tasks = workspace.dataSource({ properties: [{ name: "Оценка", type: "number" }] });
    const database = await addDatabase(session, tasks, { projectMode: "none" });
    const score = workspace.property(tasks, "Оценка");
    const changes = { projectMode: "property", projectPropertyId: score.id };

    expectValidationError(await patchDatabase(session, database.id, changes), [
      "projectPropertyId",
    ]);
  });
});

describe("DELETE /api/notion/databases/:id", () => {
  it("14. отвечает 204, база пропадает из списка баз подключения", async () => {
    const { session } = await loginWithNotion(notion);
    const tasks = await addDatabase(session, workspace.dataSource({ title: ["Задачи"] }));
    const fun = await addDatabase(session, workspace.dataSource({ title: ["Развлечения"] }));

    expect(await deleteDatabase(session, tasks.id)).toMatchObject({ status: 204 });
    expect(await connectedDatabases(session)).toMatchObject([{ id: fun.id }]);
  });

  it("14. привязанный к базе проект получает notionDatabaseId = null, проект другой базы остаётся привязан", async () => {
    const { session } = await loginWithNotion(notion);
    const tasks = await addDatabase(session, workspace.dataSource({ title: ["Задачи"] }));
    const fun = await addDatabase(session, workspace.dataSource({ title: ["Развлечения"] }));
    const work = await createProject(session, { name: "Работа", notionDatabaseId: tasks.id });
    const games = await createProject(session, { name: "Игры", notionDatabaseId: fun.id });
    await deleteDatabase(session, tasks.id);

    expect(await getProject(session, work.id)).toMatchObject({
      status: 200,
      body: { project: { notionDatabaseId: null } },
    });
    expect(await getProject(session, games.id)).toMatchObject({
      status: 200,
      body: { project: { notionDatabaseId: fun.id } },
    });
  });

  it.todo("14. у задач со страницами в удалённой базе сбрасываются страница, блоки и блоки сессий");
});
