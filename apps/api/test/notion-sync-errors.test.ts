import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import { atMinute, atSecond } from "./harness/clock.ts";
import { notionFailures } from "./harness/notion-pages.ts";
import {
  FUN_DATABASE,
  TASKS_DATABASE,
  TASK_TITLE,
  cronAt,
  fakeNotionSync,
  loginForSync,
  readTask,
  retrySync,
  syncStatus,
  userWithQueuedTask,
  userWithTaskPage,
  type FakeNotionSync,
  type UserWithQueuedTask,
} from "./harness/notion-sync.ts";
import { expectConnection, getNotionConnection } from "./harness/notion.ts";
import { createProject } from "./harness/projects.ts";
import { createTask, updateTask } from "./harness/tasks.ts";
import { startTimer } from "./harness/timers.ts";

const RATE_LIMIT_RETRY_AFTER_SEC = 30;
const TASKS_PER_DATABASE = 75;
const REQUESTS_PER_RUN = 100;
const BULK_TIMEOUT_MS = 120_000;

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

async function rateLimitedTask(): Promise<UserWithQueuedTask> {
  const queued = await userWithQueuedTask(fake);
  fake.pages.failWrites(notionFailures.rateLimited(RATE_LIMIT_RETRY_AFTER_SEC));
  await cronAt(atSecond(0));
  return queued;
}

async function rejectedTask(): Promise<UserWithQueuedTask> {
  const queued = await userWithQueuedTask(fake);
  fake.pages.failWrites(notionFailures.invalidTitle);
  await cronAt(atMinute(0));
  return queued;
}

async function expectNextAttemptAt(minute: number): Promise<void> {
  const beforeTerm = await fake.creationsDuring(() => cronAt(atSecond(minute * 60 - 1)));
  const atTerm = await fake.creationsDuring(() => cronAt(atMinute(minute)));

  expect(beforeTerm).toEqual([]);
  expect(atTerm).toHaveLength(1);
}

async function createTasks(
  session: TestSession,
  count: number,
  projectId: string | null,
): Promise<void> {
  for (let number = 1; number <= count; number += 1) {
    await createTask(session, { title: `Задача ${number}`, projectId }, atMinute(0));
  }
}

function pagesIn(dataSourceId: string): number {
  return fake.pages.list().filter((page) => page.dataSourceId === dataSourceId).length;
}

describe("лимиты Notion", () => {
  it("12. 429 с Retry-After: 30: cron в течение 30 секунд не отправляет запросов этого пользователя, кроме query pull", async () => {
    await rateLimitedTask();

    expect(fake.pages.creations()).toHaveLength(1);
    expect(
      await fake.requestsExceptPullDuring(() => cronAt(atSecond(RATE_LIMIT_RETRY_AFTER_SEC - 1))),
    ).toEqual([]);
  });

  it("12. 429 с Retry-After: 30: cron после 30 секунд отправляет запрос, у задачи появляется страница", async () => {
    const { session, task } = await rateLimitedTask();
    const creations = await fake.creationsDuring(() =>
      cronAt(atSecond(RATE_LIMIT_RETRY_AFTER_SEC + 1)),
    );

    expect(creations).toHaveLength(1);
    expect(await readTask(session, task.id, atMinute(1))).toMatchObject({
      notionPageUrl: fake.pages.last().url,
    });
  });

  it(
    "18. 150 задач в очереди в двух базах: первый cron отправляет не больше 100 запросов вместе с query pull, следующий отправляет остальные",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const session = await loginForSync();
      const { tasks, fun } = await fake.connectNotion(session, {
        databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
      });
      const games = await createProject(
        session,
        { name: "Игры", notionDatabaseId: fun.database.id },
        atMinute(0),
      );
      await createTasks(session, TASKS_PER_DATABASE, null);
      await createTasks(session, TASKS_PER_DATABASE, games.id);
      const firstRun = await fake.requestsDuring(() => cronAt(atMinute(1)));
      const secondRun = await fake.requestsDuring(() => cronAt(atMinute(2)));

      expect(firstRun.length).toBeLessThanOrEqual(REQUESTS_PER_RUN);
      expect(secondRun.length).toBeLessThanOrEqual(REQUESTS_PER_RUN);
      expect(pagesIn(tasks.dataSource.id)).toBe(TASKS_PER_DATABASE);
      expect(pagesIn(fun.dataSource.id)).toBe(TASKS_PER_DATABASE);
      expect(await syncStatus(session, atMinute(2))).toMatchObject({ pendingTasks: 0 });
    },
  );
});

describe("ошибки сервера Notion", () => {
  it("13. ответы 500 подряд: следующие попытки через 1, 2 и 4 минуты, до срока запрос не отправляется", async () => {
    await userWithQueuedTask(fake);
    fake.pages.failWrites(notionFailures.serverError, 4);
    await cronAt(atMinute(0));

    expect(fake.pages.creations()).toHaveLength(1);
    await expectNextAttemptAt(1);
    await expectNextAttemptAt(3);
    await expectNextAttemptAt(7);
  });
});

describe("страница пропала или в корзине", () => {
  it("14. 404 на PATCH: в том же запуске уходит POST /v1/pages, у задачи новый notionPageUrl", async () => {
    const { session, tasks, task, page } = await userWithTaskPage(fake);
    fake.pages.remove(page);
    await updateTask(session, task.id, { title: "Anki: испанский" }, atMinute(1));
    const creations = await fake.creationsDuring(() => cronAt(atMinute(1)));
    const recreated = fake.pages.last();

    expect(fake.pages.updates(page)).toHaveLength(1);
    expect(creations).toHaveLength(1);
    expect(recreated.id).not.toBe(page.id);
    expect(await readTask(session, task.id, atMinute(1))).toMatchObject({
      notionPageUrl: recreated.url,
      notionDatabaseId: tasks.database.id,
    });
  });

  it("15. 400 на PATCH, затем GET страницы с in_trash: true: задача в архиве, её таймер остановлен", async () => {
    const { session, task, page } = await userWithTaskPage(fake);
    await startTimer(session, task.id, atMinute(1));
    fake.pages.trash(page);
    await cronAt(atMinute(1));

    expect(fake.pages.updates(page)).toHaveLength(1);
    expect(await readTask(session, task.id, atMinute(2))).toMatchObject({
      archived: true,
      runningSessionId: null,
    });
  });
});

describe("отозванный доступ", () => {
  it("16. 401 и неудачное обновление токена: подключение needs_reauth, pendingTasks > 0", async () => {
    const { session } = await userWithQueuedTask(fake);
    fake.notion.rejectRefresh();
    fake.pages.failWrites(notionFailures.unauthorized);
    await cronAt(atMinute(0));

    expectConnection(await getNotionConnection(session, atMinute(0)), {
      status: "needs_reauth",
    });
    const { pendingTasks } = await syncStatus(session, atMinute(0));
    expect(pendingTasks).toBeGreaterThan(0);
  });
});

describe("ошибка валидации", () => {
  it("17. 400 validation_error на POST /v1/pages: задача в failed с текстом ошибки", async () => {
    const { session, task } = await rejectedTask();

    expect(await syncStatus(session, atMinute(0))).toMatchObject({
      failed: [
        { taskId: task.id, title: TASK_TITLE, error: expect.stringMatching(/\S/), attempts: 10 },
      ],
    });
  });

  it("17. POST /api/notion/sync/retry возвращает задачу в очередь, следующий cron создаёт страницу", async () => {
    const { session, task } = await rejectedTask();

    expect(await retrySync(session, atMinute(1))).toMatchObject({ status: 204 });
    expect(await syncStatus(session, atMinute(1))).toMatchObject({ pendingTasks: 1, failed: [] });
    expect(await fake.creationsDuring(() => cronAt(atMinute(1)))).toHaveLength(1);
    expect(await readTask(session, task.id, atMinute(1))).toMatchObject({
      notionPageUrl: fake.pages.last().url,
    });
  });
});
