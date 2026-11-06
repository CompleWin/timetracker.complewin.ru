import { beforeEach, describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import type { TestResponse, TestSession } from "./harness/index.ts";
import {
  addDatabase,
  connectedDatabases,
  databaseBody,
  listAvailableProperties,
  patchDatabase,
  postDatabase,
  type DatabaseSettings,
  type TestStatusOption,
} from "./harness/notion-databases.ts";
import {
  DONE,
  IN_PROGRESS,
  NOT_STARTED,
  REVIEW,
  STATUS,
  statusFieldOf,
  statusIds,
} from "./harness/notion-import.ts";
import { fakeNotionPull, statusProperty, type FakeNotionPull } from "./harness/notion-pull.ts";
import type { FakeDataSource } from "./harness/notion-workspace.ts";
import { loginWithNotion } from "./harness/notion.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";

const GROUPS = {
  "To-do": [NOT_STARTED],
  "In progress": [IN_PROGRESS],
  Complete: [REVIEW, DONE],
};

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function login(): Promise<TestSession> {
  const { session } = await loginWithNotion(fake.notion);
  return session;
}

function dataSourceWithStatus(groups: Record<string, string[]> = GROUPS): FakeDataSource {
  return fake.workspace.dataSource({ properties: [statusProperty(STATUS, groups)] });
}

function sorted(items: string[]): string[] {
  return items.toSorted();
}

function byName(items: TestStatusOption[]): TestStatusOption[] {
  return items.toSorted((left, right) => left.name.localeCompare(right.name));
}

function post(
  session: TestSession,
  dataSource: FakeDataSource,
  settings: DatabaseSettings = {},
): Promise<TestResponse> {
  return postDatabase(session, databaseBody(dataSource, settings));
}

async function connectWithTemplate(session: TestSession, templateId: string): Promise<void> {
  const attempt = await fake.notion.start({ as: session });
  await fake.notion.callback(attempt, { as: session }, { duplicatedTemplateId: templateId });
}

describe("GET /api/notion/available-databases/:dataSourceId/properties", () => {
  it("1. база со status-полем: statusProperty и statuses, у вариантов группы Complete стоит complete: true", async () => {
    const session = await login();
    const tasks = dataSourceWithStatus();
    const field = statusFieldOf(tasks);
    const response = await listAvailableProperties(session, tasks.id);
    const [notStarted, inProgress, review, done] = statusIds(tasks, [
      NOT_STARTED,
      IN_PROGRESS,
      REVIEW,
      DONE,
    ]);

    expect(response).toMatchObject({
      status: 200,
      body: { statusProperty: { id: field.id, name: STATUS }, statuses: expect.any(Array) },
    });
    expect(byName(response.body.statuses)).toMatchObject([
      { id: done, name: DONE, complete: true },
      { id: inProgress, name: IN_PROGRESS, complete: false },
      { id: notStarted, name: NOT_STARTED, complete: false },
      { id: review, name: REVIEW, complete: true },
    ]);
  });

  it("1. имя группы Complete сравнивается без учёта регистра", async () => {
    const session = await login();
    const tasks = dataSourceWithStatus({ COMPLETE: [DONE] });

    expect(await listAvailableProperties(session, tasks.id)).toMatchObject({
      status: 200,
      body: { statuses: [{ name: DONE, complete: true }] },
    });
  });

  it("1. без status-поля statusProperty = null, statuses пустой", async () => {
    const session = await login();
    const tasks = fake.workspace.dataSource();

    expect(await listAvailableProperties(session, tasks.id)).toMatchObject({
      status: 200,
      body: { statusProperty: null, statuses: [] },
    });
  });

  it("1. поле типа select статусом не считается", async () => {
    const session = await login();
    const tasks = fake.workspace.dataSource({ properties: [{ name: STATUS, type: "select" }] });

    expect(await listAvailableProperties(session, tasks.id)).toMatchObject({
      status: 200,
      body: { statusProperty: null, statuses: [] },
    });
  });

  it("1. из нескольких status-полей берётся первое", async () => {
    const session = await login();
    const tasks = fake.workspace.dataSource({
      properties: [
        statusProperty(STATUS, { Complete: [DONE] }),
        statusProperty("Этап", { "To-do": [NOT_STARTED] }),
      ],
    });

    expect(await listAvailableProperties(session, tasks.id)).toMatchObject({
      status: 200,
      body: {
        statusProperty: { id: fake.workspace.property(tasks, STATUS).id, name: STATUS },
        statuses: [{ name: DONE }],
      },
    });
  });
});

describe("POST /api/notion/databases: skippedStatusIds", () => {
  it("2. без skippedStatusIds в список попадают ровно варианты группы Complete", async () => {
    const session = await login();
    const tasks = dataSourceWithStatus();
    const response = await post(session, tasks);

    expect(response).toMatchObject({
      status: 201,
      body: { database: { statusProperty: { id: statusFieldOf(tasks).id, name: STATUS } } },
    });
    expect(sorted(response.body.database.skippedStatusIds)).toEqual(
      sorted(statusIds(tasks, [REVIEW, DONE])),
    );
  });

  it("2. с явным skippedStatusIds: [] список пустой", async () => {
    const session = await login();

    expect(await post(session, dataSourceWithStatus(), { skippedStatusIds: [] })).toMatchObject({
      status: 201,
      body: { database: { skippedStatusIds: [] } },
    });
  });

  it("2. явный список сохраняется как передан", async () => {
    const session = await login();
    const tasks = dataSourceWithStatus();
    const skippedStatusIds = statusIds(tasks, [NOT_STARTED]);

    expect(await post(session, tasks, { skippedStatusIds })).toMatchObject({
      status: 201,
      body: { database: { skippedStatusIds } },
    });
  });

  it("2. база без status-поля: statusProperty = null, skippedStatusIds пустой", async () => {
    const session = await login();

    expect(await post(session, fake.workspace.dataSource())).toMatchObject({
      status: 201,
      body: { database: { statusProperty: null, skippedStatusIds: [] } },
    });
  });

  it("2. автонастройка из шаблона работает как POST без поля: варианты группы Complete пропускаются", async () => {
    const { session } = await loginAs({ locale: "ru" });
    const tasks = dataSourceWithStatus();
    await connectWithTemplate(session, fake.workspace.templatePage(tasks));
    const [database] = await connectedDatabases(session);

    expect(database).toMatchObject({
      statusProperty: { id: statusFieldOf(tasks).id, name: STATUS },
    });
    expect(sorted(database?.skippedStatusIds ?? [])).toEqual(
      sorted(statusIds(tasks, [REVIEW, DONE])),
    );
  });
});

describe("проверка skippedStatusIds", () => {
  it("3. POST с ID, которого нет среди вариантов status-поля, даёт 400 с полем skippedStatusIds", async () => {
    const session = await login();
    const response = await post(session, dataSourceWithStatus(), {
      skippedStatusIds: [MISSING_ID],
    });

    expectValidationError(response, ["skippedStatusIds"]);
  });

  it("3. POST с ID у базы без status-поля даёт 400 с полем skippedStatusIds", async () => {
    const session = await login();
    const response = await post(session, fake.workspace.dataSource(), {
      skippedStatusIds: [MISSING_ID],
    });

    expectValidationError(response, ["skippedStatusIds"]);
  });

  it("3. PATCH с ID, которого нет среди вариантов status-поля, даёт 400 с полем skippedStatusIds", async () => {
    const session = await login();
    const database = await addDatabase(session, dataSourceWithStatus());
    const response = await patchDatabase(session, database.id, {
      skippedStatusIds: [MISSING_ID],
    });

    expectValidationError(response, ["skippedStatusIds"]);
  });

  it("3. PATCH со своими вариантами статуса сохраняет список", async () => {
    const session = await login();
    const tasks = dataSourceWithStatus();
    const database = await addDatabase(session, tasks);
    const skippedStatusIds = statusIds(tasks, [DONE]);

    expect(await patchDatabase(session, database.id, { skippedStatusIds })).toMatchObject({
      status: 200,
      body: { database: { skippedStatusIds } },
    });
  });
});
