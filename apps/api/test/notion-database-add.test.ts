import { beforeEach, describe, expect, it } from "vitest";
import { ISO_TIME, expectApiError, expectValidationError } from "./harness/assertions.ts";
import type { TestResponse, TestSession } from "./harness/index.ts";
import {
  ALL_TRACKER_FIELDS,
  MAX_DATABASES,
  PROJECT_FIELD,
  TIME_FIELDS,
  addDatabase,
  connectedDatabases,
  databaseBody,
  expectAddedFields,
  postDatabase,
  trackerFieldName,
  trackerFieldSpecs,
  type DatabaseSettings,
  type Locale,
} from "./harness/notion-databases.ts";
import {
  fakeNotionWorkspace,
  type FakeDataSource,
  type FakeNotionWorkspace,
} from "./harness/notion-workspace.ts";
import { fakeNotion, loginWithNotion, onlyCall, type FakeNotion } from "./harness/notion.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { UUID } from "./harness/session.ts";

type TimeFieldsOff = [string, DatabaseSettings];

const DATABASE_LIMIT_TIMEOUT_MS = 60_000;
const AREA = "Направление";
const WITH_TIME_FIELDS: DatabaseSettings = { timeProperties: true };

const timeFieldsOff: TimeFieldsOff[] = [
  ["без timeProperties", {}],
  ["с timeProperties: false", { timeProperties: false }],
];

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

function dataSourceWithArea(type = "select"): FakeDataSource {
  return workspace.dataSource({ properties: [{ name: AREA, type }] });
}

function projectFromArea(dataSource: FakeDataSource): DatabaseSettings {
  return { projectMode: "property", projectPropertyId: workspace.property(dataSource, AREA).id };
}

function expectAddedWithoutTimeFields(response: TestResponse): void {
  expect(response).toMatchObject({ status: 201, body: { database: { timeProperties: false } } });
}

function dataSourceWithSpentAsNumber(): FakeDataSource {
  return workspace.dataSource({
    properties: [{ name: trackerFieldName("spent", "ru"), type: "number" }],
  });
}

describe("POST /api/notion/databases: поля с временем включены", () => {
  it("2. первая база own с timeProperties: true у ru-пользователя: 201, timeProperties true", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource({ title: ["Задачи"] });
    const response = await postDatabase(
      session,
      databaseBody(tasks, { projectMode: "own", blockPosition: "start", timeProperties: true }),
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
          timeProperties: true,
          createdAt: expect.stringMatching(ISO_TIME),
        },
      },
    });
  });

  it("2. первая база own с timeProperties: true у ru-пользователя: один PATCH к Notion ровно с 5 своими полями на русском, без чужих полей", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource({
      properties: [
        { name: "Статус", type: "select" },
        { name: "Срок", type: "date" },
      ],
    });
    await addDatabase(session, tasks, { projectMode: "own", ...WITH_TIME_FIELDS });

    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", ALL_TRACKER_FIELDS);
  });

  it("2. добавленная база появляется в списке баз подключения", async () => {
    const session = await loginIn("ru");
    const database = await addDatabase(session, workspace.dataSource(), WITH_TIME_FIELDS);

    expect(await connectedDatabases(session)).toMatchObject([database]);
  });

  it("3. при timeProperties: true у en-пользователя свои поля создаются с английскими именами", async () => {
    const session = await loginIn("en");
    const tasks = workspace.dataSource();
    await addDatabase(session, tasks, { projectMode: "own", ...WITH_TIME_FIELDS });

    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "en", ALL_TRACKER_FIELDS);
  });

  it("4. при timeProperties: true поле «Затрачено, ч» типа number с русским именем у en-пользователя переиспользуется и не создаётся заново", async () => {
    const session = await loginIn("en");
    const tasks = workspace.dataSource({ properties: trackerFieldSpecs("ru", ["spentHours"]) });
    await addDatabase(session, tasks, { projectMode: "own", ...WITH_TIME_FIELDS });

    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "en", [
      "spent",
      "running",
      "lastTracked",
      "project",
    ]);
  });

  it.each<Locale>(["ru", "en"])(
    "7. все нужные свои поля уже есть с именами на %s: база с own и timeProperties: true добавляется без PATCH к Notion",
    async (fieldsLocale) => {
      const session = await loginIn("ru");
      const tasks = workspace.dataSource({
        properties: trackerFieldSpecs(fieldsLocale, ALL_TRACKER_FIELDS),
      });
      await addDatabase(session, tasks, { projectMode: "own", ...WITH_TIME_FIELDS });

      expect(workspace.schemaUpdates(tasks)).toEqual([]);
    },
  );

  it("8. при timeProperties: true своё поле «Затрачено» типа number даёт 409 property_conflict с его именем в details.name", async () => {
    const session = await loginIn("ru");
    const tasks = dataSourceWithSpentAsNumber();
    const response = await postDatabase(session, databaseBody(tasks, WITH_TIME_FIELDS));

    expectApiError(response, "property_conflict");
    expect(response.body).toMatchObject({
      error: { details: { name: trackerFieldName("spent", "ru") } },
    });
  });
});

describe("POST /api/notion/databases: поля с временем выключены", () => {
  it.each(timeFieldsOff)("21. %s: ответ 201, timeProperties = false", async (_, settings) => {
    const session = await loginIn("ru");
    const response = await postDatabase(session, databaseBody(workspace.dataSource(), settings));

    expectAddedWithoutTimeFields(response);
  });

  it.each(timeFieldsOff)(
    "21. %s в режиме own: единственный PATCH к Notion содержит только «Проект»",
    async (_, settings) => {
      const session = await loginIn("ru");
      const tasks = workspace.dataSource();
      await addDatabase(session, tasks, { projectMode: "own", ...settings });

      expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", PROJECT_FIELD);
    },
  );

  it.each(timeFieldsOff)(
    "21. %s в режимах property и none: PATCH к Notion не отправляется",
    async (_, settings) => {
      const session = await loginIn("ru");
      const byArea = dataSourceWithArea();
      const withoutProject = workspace.dataSource();
      await addDatabase(session, byArea, { ...projectFromArea(byArea), ...settings });
      await addDatabase(session, withoutProject, { projectMode: "none", ...settings });

      expect(workspace.schemaUpdates(byArea)).toEqual([]);
      expect(workspace.schemaUpdates(withoutProject)).toEqual([]);
    },
  );

  it.each(timeFieldsOff)(
    "21. %s: поле «Затрачено» типа number не даёт property_conflict",
    async (_, settings) => {
      const session = await loginIn("ru");
      const tasks = dataSourceWithSpentAsNumber();
      const response = await postDatabase(session, databaseBody(tasks, settings));

      expectAddedWithoutTimeFields(response);
    },
  );
});

describe("POST /api/notion/databases: режим проекта", () => {
  it.each(["select", "multi_select"])(
    "5. property с полем %s и timeProperties: true: в PATCH к Notion 4 поля с временем, «Проект» не создаётся, projectProperty содержит id, name и type",
    async (type) => {
      const session = await loginIn("ru");
      const tasks = dataSourceWithArea(type);
      const response = await postDatabase(
        session,
        databaseBody(tasks, { ...projectFromArea(tasks), ...WITH_TIME_FIELDS }),
      );

      expect(response).toMatchObject({
        status: 201,
        body: {
          database: {
            projectMode: "property",
            projectProperty: { id: workspace.property(tasks, AREA).id, name: AREA, type },
            timeProperties: true,
          },
        },
      });
      expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", TIME_FIELDS);
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
    const other = dataSourceWithArea();

    expectValidationError(
      await postDatabase(session, databaseBody(tasks, { projectMode: "property" })),
      ["projectPropertyId"],
    );
    expectValidationError(
      await postDatabase(session, databaseBody(tasks, projectFromArea(other))),
      ["projectPropertyId"],
    );
  });

  it("6. none с timeProperties: true: в PATCH к Notion 4 поля с временем, «Проект» не создаётся, projectProperty = null", async () => {
    const session = await loginIn("ru");
    const tasks = workspace.dataSource();
    const response = await postDatabase(
      session,
      databaseBody(tasks, { projectMode: "none", ...WITH_TIME_FIELDS }),
    );

    expect(response).toMatchObject({
      status: 201,
      body: { database: { projectMode: "none", projectProperty: null, timeProperties: true } },
    });
    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", TIME_FIELDS);
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
