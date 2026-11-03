import { beforeEach, describe, expect, it } from "vitest";
import { ISO_TIME, expectApiError, expectValidationError } from "./harness/assertions.ts";
import type { TestSession } from "./harness/index.ts";
import {
  ALWAYS_NEEDED_FIELDS,
  MAX_DATABASES,
  OWN_MODE_FIELDS,
  addDatabase,
  connectedDatabases,
  databaseBody,
  expectAddedFields,
  postDatabase,
  trackerFieldName,
  trackerFieldSpecs,
  type Locale,
} from "./harness/notion-databases.ts";
import { fakeNotionWorkspace, type FakeNotionWorkspace } from "./harness/notion-workspace.ts";
import { fakeNotion, loginWithNotion, onlyCall, type FakeNotion } from "./harness/notion.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { UUID } from "./harness/session.ts";

const DATABASE_LIMIT_TIMEOUT_MS = 60_000;

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

async function loginIn(locale: Locale): Promise<TestSession> {
  const { session } = await loginWithNotion(notion, { locale });
  return session;
}

async function addDatabases(session: TestSession, count: number): Promise<void> {
  for (let number = 1; number <= count; number += 1) {
    await addDatabase(session, workspace.dataSource({ title: [`База ${number}`] }));
  }
}

describe("POST /api/notion/databases: свои поля трекера", () => {
  it("2. первая база own у ru-пользователя: 201, isDefault true", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource({ title: ["Задачи"] });
    const response = await postDatabase(
      session,
      databaseBody(tasks, { projectMode: "own", blockPosition: "start" }),
    );

    expect(response).toMatchObject({
      status: 201,
      body: {
        database: {
          id: expect.stringMatching(UUID),
          dataSourceId: tasks.id,
          databaseId: tasks.databaseId,
          title: "Задачи",
          projectMode: "own",
          projectProperty: null,
          blockPosition: "start",
          isDefault: true,
          createdAt: expect.stringMatching(ISO_TIME),
        },
      },
    });
  });

  it("2. первая база own у ru-пользователя: один PATCH к Notion ровно с 5 своими полями на русском, без чужих полей", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource({
      properties: [
        { name: "Статус", type: "select" },
        { name: "Срок", type: "date" },
      ],
    });
    await addDatabase(session, tasks, { projectMode: "own" });

    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", OWN_MODE_FIELDS);
  });

  it("2. добавленная база появляется в списке баз подключения", async () => {
    const session = await loginIn("ru");
    const database = await addDatabase(session, workspace.dataSource());

    expect(await connectedDatabases(session)).toMatchObject([database]);
  });

  it("3. у en-пользователя свои поля создаются с английскими именами", async () => {
    const session = await loginIn("en");
    const tasks = workspace.dataSource();
    await addDatabase(session, tasks, { projectMode: "own" });

    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "en", OWN_MODE_FIELDS);
  });

  it("4. своё поле «Затрачено, ч» типа number с русским именем у en-пользователя переиспользуется и не создаётся заново", async () => {
    const session = await loginIn("en");
    const tasks = workspace.dataSource({ properties: trackerFieldSpecs("ru", ["spentHours"]) });
    await addDatabase(session, tasks, { projectMode: "own" });

    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "en", [
      "spent",
      "running",
      "lastTracked",
      "project",
    ]);
  });

  it.each<Locale>(["ru", "en"])(
    "7. все нужные свои поля уже есть с именами на %s: база добавляется без PATCH к Notion",
    async (fieldsLocale) => {
      const session = await loginIn("ru");
      const tasks = workspace.dataSource({
        properties: trackerFieldSpecs(fieldsLocale, OWN_MODE_FIELDS),
      });
      await addDatabase(session, tasks, { projectMode: "own" });

      expect(workspace.schemaUpdates(tasks)).toEqual([]);
    },
  );

  it("8. своё поле «Затрачено» типа number даёт 409 property_conflict с его именем в details.name", async () => {
    const session = await loginIn("ru");
    const spent = trackerFieldName("spent", "ru");
    const tasks = workspace.dataSource({ properties: [{ name: spent, type: "number" }] });
    const response = await postDatabase(session, databaseBody(tasks));

    expectApiError(response, "property_conflict");
    expect(response.body).toMatchObject({ error: { details: { name: spent } } });
  });
});

describe("POST /api/notion/databases: режим проекта", () => {
  it.each(["select", "multi_select"])(
    "5. property с полем %s: своё поле «Проект» не создаётся, projectProperty содержит id, name и type",
    async (type) => {
      const session = await loginIn("ru");
      const tasks = workspace.dataSource({ properties: [{ name: "Направление", type }] });
      const area = workspace.property(tasks, "Направление");
      const response = await postDatabase(
        session,
        databaseBody(tasks, { projectMode: "property", projectPropertyId: area.id }),
      );

      expect(response).toMatchObject({
        status: 201,
        body: {
          database: {
            projectMode: "property",
            projectProperty: { id: area.id, name: "Направление", type },
          },
        },
      });
      expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", ALWAYS_NEEDED_FIELDS);
    },
  );

  it("5. property с полем типа number в projectPropertyId даёт 400 с полем projectPropertyId", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource({ properties: [{ name: "Оценка", type: "number" }] });
    const score = workspace.property(tasks, "Оценка");
    const body = databaseBody(tasks, { projectMode: "property", projectPropertyId: score.id });

    expectValidationError(await postDatabase(session, body), ["projectPropertyId"]);
  });

  it("5. property без projectPropertyId или с полем не из этой базы даёт 400 с полем projectPropertyId", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource();
    const other = workspace.dataSource({ properties: [{ name: "Направление", type: "select" }] });
    const foreignId = workspace.property(other, "Направление").id;

    expectValidationError(
      await postDatabase(session, databaseBody(tasks, { projectMode: "property" })),
      ["projectPropertyId"],
    );
    expectValidationError(
      await postDatabase(
        session,
        databaseBody(tasks, { projectMode: "property", projectPropertyId: foreignId }),
      ),
      ["projectPropertyId"],
    );
  });

  it("6. none: своё поле «Проект» не создаётся, projectProperty = null", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource();
    const response = await postDatabase(session, databaseBody(tasks, { projectMode: "none" }));

    expect(response).toMatchObject({
      status: 201,
      body: { database: { projectMode: "none", projectProperty: null } },
    });
    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", ALWAYS_NEEDED_FIELDS);
  });
});

describe("POST /api/notion/databases: ошибки", () => {
  it("9. GET /v1/data_sources отвечает 404: 400 с полем dataSourceId", async () => {
    const session = await loginIn("ru");
    const body = { dataSourceId: MISSING_ID, projectMode: "own", blockPosition: "start" };

    expectValidationError(await postDatabase(session, body), ["dataSourceId"]);
  });

  it("10. повторное добавление той же базы даёт 409 database_already_added с details.databaseId", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource();
    const added = await addDatabase(session, tasks);
    const response = await postDatabase(session, databaseBody(tasks));

    expectApiError(response, "database_already_added");
    expect(response.body).toMatchObject({ error: { details: { databaseId: added.id } } });
  });

  it(
    "11. 50 баз добавляются, 51-я даёт 409 too_many_databases",
    { timeout: DATABASE_LIMIT_TIMEOUT_MS },
    async () => {
      const session = await loginIn("ru");
      await addDatabases(session, MAX_DATABASES);
      const extra = workspace.dataSource({ title: ["Лишняя"] });

      expectApiError(await postDatabase(session, databaseBody(extra)), "too_many_databases");
    },
  );
});
