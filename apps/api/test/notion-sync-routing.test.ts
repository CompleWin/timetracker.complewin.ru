import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import { atMinute } from "./harness/clock.ts";
import { deleteDatabase } from "./harness/notion-databases.ts";
import {
  FUN_DATABASE,
  TASKS_DATABASE,
  cronAt,
  fakeNotionSync,
  loginForSync,
  readTask,
  syncStatus,
  type FakeNotionSync,
  type SyncedDatabase,
} from "./harness/notion-sync.ts";
import { linkedTask, projectBoundTo } from "./harness/notion-task-pages.ts";
import { onlyCall } from "./harness/notion.ts";
import { updateTask } from "./harness/tasks.ts";

type UserWithTwoDatabases = {
  session: TestSession;
  tasks: SyncedDatabase;
  fun: SyncedDatabase;
};

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

async function userWithTwoDatabases(): Promise<UserWithTwoDatabases> {
  const session = await loginForSync();
  const databases = await fake.connectNotion(session, {
    databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
  });
  return { session, ...databases };
}

describe("страница задачи остаётся в своей базе", () => {
  it("4. задача со страницей в «Задачах» перенесена в проект «Развлечений»: cron отправляет PATCH той же страницы и не создаёт новых", async () => {
    const { session, tasks, fun } = await userWithTwoDatabases();
    const games = await projectBoundTo(fake, session, fun, "Игры");
    const { task, page } = await linkedTask(fake, session, tasks, { title: "Ведьмак" });
    await cronAt(atMinute(0));
    await updateTask(session, task.id, { projectId: games.id }, atMinute(1));
    const updates = await fake.updatesDuring(page, () => cronAt(atMinute(1)));

    expect(games).toMatchObject({ notionDatabaseId: fun.database.id });
    onlyCall(updates);
    expect(fake.pages.creations()).toEqual([]);
    expect(await readTask(session, task.id, atMinute(1))).toMatchObject({
      projectId: games.id,
      notionPageUrl: page.url,
      notionDatabaseId: tasks.database.id,
    });
  });
});

describe("удаление базы", () => {
  it("20. у задач со страницами удалённой базы notionPageUrl и notionDatabaseId равны null, их элементы пропали из очереди, cron не отправляет запросов, кроме query pull", async () => {
    const { session, tasks, fun } = await userWithTwoDatabases();
    const report = await linkedTask(fake, session, tasks, { title: "Отчёт" });
    const movie = await linkedTask(fake, session, fun, { title: "Кино" });
    await cronAt(atMinute(0));
    await updateTask(session, report.task.id, { title: "Годовой отчёт" }, atMinute(1));
    await deleteDatabase(session, tasks.database.id, atMinute(2));

    expect(await readTask(session, report.task.id, atMinute(2))).toMatchObject({
      notionPageUrl: null,
      notionDatabaseId: null,
    });
    expect(await readTask(session, movie.task.id, atMinute(2))).toMatchObject({
      notionPageUrl: movie.page.url,
      notionDatabaseId: fun.database.id,
    });
    expect(await syncStatus(session, atMinute(2))).toMatchObject({ pendingTasks: 0 });
    expect(await fake.requestsExceptPullDuring(() => cronAt(atMinute(3)))).toEqual([]);
  });
});
