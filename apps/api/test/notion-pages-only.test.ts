import { beforeEach, describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api, type TestSession } from "./harness/index.ts";
import { atMinute } from "./harness/clock.ts";
import { addSession } from "./harness/manual-sessions.ts";
import {
  IMPORT_RUN,
  TASKS_BASE,
  TASKS_TITLE,
  activeTasks,
  pageIn,
  taskOfPage,
} from "./harness/notion-import.ts";
import { fakeNotionPull, userWithDatabase, type FakeNotionPull } from "./harness/notion-pull.ts";
import { SETUP_TIME, TASK_TITLE, cronAt, readTask, syncStatus } from "./harness/notion-sync.ts";
import { userWithTaskPage } from "./harness/notion-task-pages.ts";
import { onlyCall } from "./harness/notion.ts";
import { createProject, updateProject } from "./harness/projects.ts";
import { createTask, updateTask } from "./harness/tasks.ts";
import { startTimer, stopTimer } from "./harness/timers.ts";

type ProjectOfSiteTask = [string, (session: TestSession) => Promise<string | null>];

const SESSION_RECORDED = atMinute(12);

const projectsOfSiteTask: ProjectOfSiteTask[] = [
  ["без проекта", async () => null],
  [
    "в проекте с сайта",
    async (session) => (await createProject(session, { name: "Работа" }, SETUP_TIME)).id,
  ],
];

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

function recordSession(session: TestSession, taskId: string): Promise<unknown> {
  return addSession(
    session,
    taskId,
    { startedAt: atMinute(10).now, endedAt: atMinute(11).now },
    SESSION_RECORDED,
  );
}

async function siteTaskNextToRecord(): Promise<{ session: TestSession; taskId: string }> {
  const { session, added } = await userWithDatabase(fake, TASKS_BASE);
  const project = await createProject(session, { name: TASKS_TITLE }, SETUP_TIME);
  const task = await createTask(session, { title: TASK_TITLE, projectId: project.id }, SETUP_TIME);
  pageIn(fake, added, TASK_TITLE);
  return { session, taskId: task.id };
}

describe("задачи и проекты с сайта живут только в трекере", () => {
  it.each(projectsOfSiteTask)(
    "1. задача с сайта %s при добавленной базе: cron не отправляет ничего, кроме query pull",
    async (_, projectIdOf) => {
      const { session } = await userWithDatabase(fake);
      const projectId = await projectIdOf(session);
      await createTask(session, { title: TASK_TITLE, projectId }, SETUP_TIME);

      expect(await fake.requestsExceptPullDuring(() => cronAt(SETUP_TIME))).toEqual([]);
    },
  );

  it.each(projectsOfSiteTask)(
    "1. запуск таймера, сессия и переименование задачи с сайта %s ничего не отправляют, pendingTasks = 0",
    async (_, projectIdOf) => {
      const { session } = await userWithDatabase(fake);
      const projectId = await projectIdOf(session);
      const task = await createTask(session, { title: TASK_TITLE, projectId }, SETUP_TIME);
      await startTimer(session, task.id, atMinute(1));
      const whileRunning = await fake.requestsExceptPullDuring(async () => {
        await cronAt(atMinute(1));
        await cronAt(atMinute(12));
      });
      await stopTimer(session, task.id, atMinute(13));
      await addSession(
        session,
        task.id,
        { startedAt: atMinute(14).now, endedAt: atMinute(15).now },
        atMinute(16),
      );
      await updateTask(session, task.id, { title: "Anki: испанский" }, atMinute(16));
      const status = await syncStatus(session, atMinute(16));
      const afterChanges = await fake.requestsExceptPullDuring(() => cronAt(atMinute(16)));

      expect(status).toMatchObject({ pendingTasks: 0 });
      expect([...whileRunning, ...afterChanges]).toEqual([]);
    },
  );

  it("2. проект, созданный на сайте, и его переименование: cron не отправляет ничего, кроме query pull", async () => {
    const { session } = await userWithDatabase(fake);
    const requests = await fake.requestsExceptPullDuring(async () => {
      const work = await createProject(session, { name: "Работа" }, SETUP_TIME);
      await createTask(session, { title: "Отчёт", projectId: work.id }, SETUP_TIME);
      await cronAt(SETUP_TIME);
      await updateProject(session, work.id, { name: "Работа 2026" }, atMinute(1));
      await cronAt(atMinute(1));
    });

    expect(requests).toEqual([]);
  });

  it("7. POST /api/notion/export отвечает 404", async () => {
    const { session } = await userWithDatabase(fake);
    const response = await api.post("/api/notion/export", undefined, {
      ...SETUP_TIME,
      as: session,
    });

    expectApiError(response, "not_found");
  });
});

describe("задачи со страницей синхронизируются", () => {
  it("3. импортированная задача получает сессию: уходит PATCH страницы, POST /v1/pages нет", async () => {
    const { session, added } = await userWithDatabase(fake, TASKS_BASE);
    const page = pageIn(fake, added, TASK_TITLE);
    await cronAt(IMPORT_RUN);
    await recordSession(session, (await taskOfPage(session, page, IMPORT_RUN)).id);

    onlyCall(await fake.updatesDuring(page, () => cronAt(SESSION_RECORDED)));
    expect(fake.pages.creations()).toEqual([]);
  });

  it("3. задача после link получает сессию: уходит PATCH страницы, POST /v1/pages нет", async () => {
    const { session, task, page } = await userWithTaskPage(fake);
    await recordSession(session, task.id);

    onlyCall(await fake.updatesDuring(page, () => cronAt(SESSION_RECORDED)));
    expect(fake.pages.creations()).toEqual([]);
  });

  it("6. задача с сайта и новая запись с тем же названием в том же проекте: после cron задача связана со страницей, новая не создаётся", async () => {
    const { session, taskId } = await siteTaskNextToRecord();
    await cronAt(IMPORT_RUN);
    const page = fake.pages.last();

    expect(await activeTasks(session, IMPORT_RUN)).toMatchObject([
      { id: taskId, notionPageUrl: page.url },
    ]);
  });

  it("6. у задачи с сайта с сессиями после связывания уходит PATCH страницы", async () => {
    const { session, taskId } = await siteTaskNextToRecord();
    await addSession(
      session,
      taskId,
      { startedAt: atMinute(1).now, endedAt: atMinute(2).now },
      atMinute(3),
    );

    onlyCall(await fake.updatesDuring(fake.pages.last(), () => cronAt(IMPORT_RUN)));
  });

  it("12. задача со страницей для тестов шагов 10–12.1 получается через link: у неё notionPageUrl и notionDatabaseId базы, cron отправляет PATCH страницы без POST /v1/pages", async () => {
    const { session, tasks, task, page } = await userWithTaskPage(fake);

    expect(await readTask(session, task.id, SETUP_TIME)).toMatchObject({
      notionPageUrl: page.url,
      notionDatabaseId: tasks.database.id,
    });
    onlyCall(fake.pages.updates(page));
    expect(fake.pages.creations()).toEqual([]);
  });
});
