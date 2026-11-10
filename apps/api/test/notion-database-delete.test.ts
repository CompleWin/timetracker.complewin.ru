import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import { connectedDatabases, deleteDatabase } from "./harness/notion-databases.ts";
import { fakeNotionPull, type FakeNotionPull } from "./harness/notion-pull.ts";
import {
  FUN_DATABASE,
  SETUP_TIME,
  TASKS_DATABASE,
  cronAt,
  loginForSync,
  readTask,
  type SyncedDatabase,
} from "./harness/notion-sync.ts";
import { linkedTask, projectBoundTo } from "./harness/notion-task-pages.ts";
import { getProject } from "./harness/projects.ts";

type UserWithTwoDatabases = {
  session: TestSession;
  tasks: SyncedDatabase;
  fun: SyncedDatabase;
};

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function userWithTwoDatabases(): Promise<UserWithTwoDatabases> {
  const session = await loginForSync();
  const databases = await fake.connectNotion(session, {
    databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
  });
  return { session, ...databases };
}

describe("DELETE /api/notion/databases/:id", () => {
  it("14. отвечает 204, база пропадает из списка баз подключения", async () => {
    const { session, tasks, fun } = await userWithTwoDatabases();

    expect(await deleteDatabase(session, tasks.database.id, SETUP_TIME)).toMatchObject({
      status: 204,
    });
    expect(await connectedDatabases(session, SETUP_TIME)).toMatchObject([{ id: fun.database.id }]);
  });

  it("14. привязанный к базе проект получает notionDatabaseId = null, проект другой базы остаётся привязан", async () => {
    const { session, tasks, fun } = await userWithTwoDatabases();
    const work = await projectBoundTo(fake, session, tasks, "Работа");
    const games = await projectBoundTo(fake, session, fun, "Игры");
    await deleteDatabase(session, tasks.database.id, SETUP_TIME);

    expect(await getProject(session, work.id, SETUP_TIME)).toMatchObject({
      status: 200,
      body: { project: { notionDatabaseId: null } },
    });
    expect(await getProject(session, games.id, SETUP_TIME)).toMatchObject({
      status: 200,
      body: { project: { notionDatabaseId: fun.database.id } },
    });
  });

  it("14. у задач со страницами в удалённой базе сбрасываются notionPageUrl и notionDatabaseId, задачи другой базы сохраняют связь, страницы в Notion остаются", async () => {
    const { session, tasks, fun } = await userWithTwoDatabases();
    const report = await linkedTask(fake, session, tasks, { title: "Отчёт" });
    const movie = await linkedTask(fake, session, fun, { title: "Кино" });
    await cronAt(SETUP_TIME);
    await deleteDatabase(session, tasks.database.id, SETUP_TIME);

    expect(fake.pages.list()).toEqual(expect.arrayContaining([report.page, movie.page]));
    expect(await readTask(session, report.task.id, SETUP_TIME)).toMatchObject({
      notionPageUrl: null,
      notionDatabaseId: null,
    });
    expect(await readTask(session, movie.task.id, SETUP_TIME)).toMatchObject({
      notionPageUrl: movie.page.url,
      notionDatabaseId: fun.database.id,
    });
  });
});
