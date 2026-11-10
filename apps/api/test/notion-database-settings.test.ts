import { beforeEach, describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import {
  ALL_TRACKER_FIELDS,
  PROJECT_FIELD,
  TIME_FIELDS,
  addDatabase,
  callsFromNowOn,
  expectAddedFields,
  patchDatabase,
} from "./harness/notion-databases.ts";
import { fakeNotionWorkspace, type FakeNotionWorkspace } from "./harness/notion-workspace.ts";
import { fakeNotion, loginWithNotion, onlyCall, type FakeNotion } from "./harness/notion.ts";

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

describe("PATCH /api/notion/databases/:id: режим проекта", () => {
  it("13. переход из none в own добавляет своё поле «Проект» одним PATCH к Notion", async () => {
    const { session } = await loginWithNotion(notion, { locale: "ru" });
    const tasks = workspace.dataSource();
    const database = await addDatabase(session, tasks, { projectMode: "none" });
    const schemaUpdates = callsFromNowOn(() => workspace.schemaUpdates(tasks));
    const response = await patchDatabase(session, database.id, { projectMode: "own" });

    expect(response).toMatchObject({
      status: 200,
      body: { database: { id: database.id, projectMode: "own", projectProperty: null } },
    });
    expectAddedFields(onlyCall(schemaUpdates()), "ru", PROJECT_FIELD);
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

describe("PATCH /api/notion/databases/:id: поля с временем", () => {
  it("22. timeProperties: true у базы с false добавляет 4 поля с временем одним PATCH к Notion", async () => {
    const { session } = await loginWithNotion(notion, { locale: "ru" });
    const tasks = workspace.dataSource();
    const database = await addDatabase(session, tasks, { projectMode: "own" });
    const schemaUpdates = callsFromNowOn(() => workspace.schemaUpdates(tasks));
    const response = await patchDatabase(session, database.id, { timeProperties: true });

    expect(response).toMatchObject({
      status: 200,
      body: { database: { id: database.id, timeProperties: true } },
    });
    expectAddedFields(onlyCall(schemaUpdates()), "ru", TIME_FIELDS);
  });

  it("22. timeProperties: true вместе с переходом из none в own отправляет все 5 полей одним PATCH к Notion", async () => {
    const { session } = await loginWithNotion(notion, { locale: "ru" });
    const tasks = workspace.dataSource();
    const database = await addDatabase(session, tasks, { projectMode: "none" });
    const schemaUpdates = callsFromNowOn(() => workspace.schemaUpdates(tasks));
    const changes = { projectMode: "own", timeProperties: true };

    expect(await patchDatabase(session, database.id, changes)).toMatchObject({
      status: 200,
      body: { database: { id: database.id, projectMode: "own", timeProperties: true } },
    });
    expectAddedFields(onlyCall(schemaUpdates()), "ru", ALL_TRACKER_FIELDS);
  });

  it("23. timeProperties: false у базы с true к Notion не обращается, ответ содержит timeProperties = false", async () => {
    const { session } = await loginWithNotion(notion, { locale: "ru" });
    const database = await addDatabase(session, workspace.dataSource(), { timeProperties: true });
    const notionRequests = callsFromNowOn(() => notion.requests());

    expect(await patchDatabase(session, database.id, { timeProperties: false })).toMatchObject({
      status: 200,
      body: { database: { id: database.id, timeProperties: false } },
    });
    expect(notionRequests()).toEqual([]);
  });
});
