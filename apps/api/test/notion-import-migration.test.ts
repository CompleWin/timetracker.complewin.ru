import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import { atMinute } from "./harness/clock.ts";
import { updateDatabase, type TestNotionDatabase } from "./harness/notion-databases.ts";
import {
  DONE,
  IMPORT_RUN,
  IN_PROGRESS,
  NEXT_RUN,
  REVIEW,
  STATUS,
  TASKS_BASE,
  TASKS_BASE_WITH_STATUS,
  TASKS_TITLE,
  activeTasks,
  filterOf,
  pageIn,
  statusFieldOf,
  statusIds,
  withStatus,
} from "./harness/notion-import.ts";
import { fakeNotionPull, projectOfTask, type FakeNotionPull } from "./harness/notion-pull.ts";
import {
  SETUP_TIME,
  callsDuring,
  cronAt,
  loginForSync,
  readTask,
  type DatabaseSetup,
  type SyncedDatabase,
} from "./harness/notion-sync.ts";
import { getNotionConnection, onlyCall } from "./harness/notion.ts";
import { linkedTask } from "./harness/notion-task-pages.ts";
import { createProject, type TestProject } from "./harness/projects.ts";
import { requireStatus } from "./harness/rest.ts";
import { replayAutoImportMigrations } from "./harness/schema-replay.ts";
import { updateTask, type TestTask } from "./harness/tasks.ts";

type UserWithTwoTasks = {
  session: TestSession;
  tasks: SyncedDatabase;
  work: TestProject;
  withoutProject: TestTask;
  inProject: TestTask;
};

const LEFT_PROJECT = atMinute(1);

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function databaseAtSetup(session: TestSession): Promise<TestNotionDatabase> {
  const response = await getNotionConnection(session, SETUP_TIME);
  return requireStatus(response, 200, "GET /api/notion/connection").body.connection.databases[0];
}

async function userWithPushedTasks(database: DatabaseSetup): Promise<UserWithTwoTasks> {
  const session = await loginForSync();
  const { tasks } = await fake.connectNotion(session, { databases: { tasks: database } });
  const work = await createProject(session, { name: "Работа" }, SETUP_TIME);
  const linked = await linkedTask(fake, session, tasks, { title: "Без проекта" });
  const inProject = await linkedTask(
    fake,
    session,
    tasks,
    { title: "Отчёт" },
    { projectId: work.id },
  );
  await cronAt(SETUP_TIME);
  await updateTask(session, linked.task.id, { projectId: null }, LEFT_PROJECT);
  await cronAt(LEFT_PROJECT);
  return { session, tasks, work, withoutProject: linked.task, inProject: inProject.task };
}

function pageUpdatesDuring(action: () => Promise<unknown>) {
  return callsDuring(() => fake.pages.updates(), action);
}

describe("связанная задача без проекта", () => {
  it("24. база до миграции: первый проход идёт без filter", async () => {
    await userWithPushedTasks(TASKS_BASE);
    await replayAutoImportMigrations();
    const query = onlyCall(await fake.queriesDuring(() => cronAt(IMPORT_RUN)));

    expect(filterOf(query)).toBeUndefined();
  });

  it("24. база до миграции: после полного прохода задача в проекте базы, PATCH страницы не отправляется", async () => {
    const { session, tasks, withoutProject } = await userWithPushedTasks(TASKS_BASE);
    await replayAutoImportMigrations();
    const updates = await pageUpdatesDuring(() => cronAt(IMPORT_RUN));

    expect(await projectOfTask(session, withoutProject.id, IMPORT_RUN)).toMatchObject({
      name: TASKS_TITLE,
      notionDatabaseId: tasks.database.id,
    });
    expect(updates).toEqual([]);
  });

  it("24. база до миграции: задача в другом проекте не трогается", async () => {
    const { session, work, inProject } = await userWithPushedTasks(TASKS_BASE);
    await replayAutoImportMigrations();
    await cronAt(IMPORT_RUN);

    expect(await readTask(session, inProject.id, IMPORT_RUN)).toMatchObject({
      projectId: work.id,
    });
  });

  it("24. полный проход после PATCH, который убирает ID: задача без проекта получает проект базы, PATCH страницы не отправляется", async () => {
    const { session, tasks, withoutProject } = await userWithPushedTasks(TASKS_BASE_WITH_STATUS);
    await updateDatabase(session, tasks.database.id, { skippedStatusIds: [] }, IMPORT_RUN);
    const updates = await pageUpdatesDuring(() => cronAt(NEXT_RUN));

    expect(await projectOfTask(session, withoutProject.id, NEXT_RUN)).toMatchObject({
      name: TASKS_TITLE,
    });
    expect(updates).toEqual([]);
  });
});

describe("база, добавленная до шага", () => {
  async function migratedBaseWithStatus(): Promise<{
    session: TestSession;
    tasks: SyncedDatabase;
  }> {
    const session = await loginForSync();
    const { tasks } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_BASE_WITH_STATUS },
    });
    await cronAt(SETUP_TIME);
    await replayAutoImportMigrations();
    return { session, tasks };
  }

  it("25. до первого pull в ответах API statusProperty = null и skippedStatusIds = []", async () => {
    const { session } = await migratedBaseWithStatus();

    expect(await databaseAtSetup(session)).toMatchObject({
      statusProperty: null,
      skippedStatusIds: [],
    });
  });

  it("25. первый pull запрашивает GET /v1/data_sources/{id} и заполняет statusProperty и skippedStatusIds", async () => {
    const { session, tasks } = await migratedBaseWithStatus();
    const reads = await callsDuring(
      () => fake.workspace.dataSourceReads(tasks.dataSource),
      () => cronAt(IMPORT_RUN),
    );
    const database = await databaseAtSetup(session);

    expect(reads).toHaveLength(1);
    expect(database).toMatchObject({
      statusProperty: { id: statusFieldOf(tasks.dataSource).id, name: STATUS },
    });
    expect(database.skippedStatusIds.toSorted()).toEqual(
      statusIds(tasks.dataSource, [REVIEW, DONE]).toSorted(),
    );
  });

  it("25. завершённые записи не импортируются", async () => {
    const { session, tasks } = await migratedBaseWithStatus();
    pageIn(fake, tasks, "Завершённая", withStatus(tasks.dataSource, DONE));
    pageIn(fake, tasks, "В работе", withStatus(tasks.dataSource, IN_PROGRESS));
    await cronAt(IMPORT_RUN);

    expect(await activeTasks(session, IMPORT_RUN)).toMatchObject([{ title: "В работе" }]);
  });
});
