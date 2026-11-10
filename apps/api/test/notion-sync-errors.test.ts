import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import { atMinute, atSecond } from "./harness/clock.ts";
import { notionFailures, type FakePage } from "./harness/notion-pages.ts";
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
  type FakeNotionSync,
  type SyncedDatabase,
} from "./harness/notion-sync.ts";
import {
  linkedTask,
  userWithLinkedTask,
  userWithTaskPage,
  type UserWithTaskPage,
} from "./harness/notion-task-pages.ts";
import { expectConnection, getNotionConnection } from "./harness/notion.ts";
import { startTimer } from "./harness/timers.ts";

const RATE_LIMIT_RETRY_AFTER_SEC = 30;
const TASKS_PER_DATABASE = 75;
const REQUESTS_PER_RUN = 100;
const BULK_TIMEOUT_MS = 120_000;

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

async function rateLimitedTask(): Promise<UserWithTaskPage> {
  const user = await userWithLinkedTask(fake);
  fake.pages.failWrites(notionFailures.rateLimited(RATE_LIMIT_RETRY_AFTER_SEC));
  await cronAt(atSecond(0));
  return user;
}

async function rejectedTask(): Promise<UserWithTaskPage> {
  const user = await userWithLinkedTask(fake);
  fake.pages.failWrites(notionFailures.invalidTitle);
  await cronAt(atMinute(0));
  return user;
}

async function expectNextAttemptAt(page: FakePage, minute: number): Promise<void> {
  const beforeTerm = await fake.updatesDuring(page, () => cronAt(atSecond(minute * 60 - 1)));
  const atTerm = await fake.updatesDuring(page, () => cronAt(atMinute(minute)));

  expect(beforeTerm).toEqual([]);
  expect(atTerm).toHaveLength(1);
}

async function linkTasks(
  session: TestSession,
  database: SyncedDatabase,
  count: number,
): Promise<FakePage[]> {
  const pages: FakePage[] = [];
  for (let number = 1; number <= count; number += 1) {
    pages.push((await linkedTask(fake, session, database, { title: `Задача ${number}` })).page);
  }
  return pages;
}

describe("лимиты Notion", () => {
  it("12. 429 с Retry-After: 30: cron в течение 30 секунд не отправляет запросов этого пользователя, кроме query pull", async () => {
    const { page } = await rateLimitedTask();

    expect(fake.pages.updates(page)).toHaveLength(1);
    expect(
      await fake.requestsExceptPullDuring(() => cronAt(atSecond(RATE_LIMIT_RETRY_AFTER_SEC - 1))),
    ).toEqual([]);
  });

  it("12. 429 с Retry-After: 30: cron после 30 секунд отправляет PATCH страницы, очередь пустеет", async () => {
    const { session, page } = await rateLimitedTask();
    const updates = await fake.updatesDuring(page, () =>
      cronAt(atSecond(RATE_LIMIT_RETRY_AFTER_SEC + 1)),
    );

    expect(updates).toHaveLength(1);
    expect(await syncStatus(session, atMinute(1))).toMatchObject({ pendingTasks: 0 });
  });

  it(
    "18. 150 задач со страницами в очереди в двух базах: первый cron отправляет не больше 100 запросов вместе с query pull, следующий отправляет остальные",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const session = await loginForSync();
      const { tasks, fun } = await fake.connectNotion(session, {
        databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
      });
      const pages = [
        ...(await linkTasks(session, tasks, TASKS_PER_DATABASE)),
        ...(await linkTasks(session, fun, TASKS_PER_DATABASE)),
      ];
      const firstRun = await fake.requestsDuring(() => cronAt(atMinute(1)));
      const secondRun = await fake.requestsDuring(() => cronAt(atMinute(2)));

      expect(firstRun.length).toBeLessThanOrEqual(REQUESTS_PER_RUN);
      expect(secondRun.length).toBeLessThanOrEqual(REQUESTS_PER_RUN);
      expect(pages.filter((page) => fake.pages.updates(page).length === 1)).toHaveLength(
        pages.length,
      );
      expect(fake.pages.creations()).toEqual([]);
      expect(await syncStatus(session, atMinute(2))).toMatchObject({ pendingTasks: 0 });
    },
  );
});

describe("ошибки сервера Notion", () => {
  it("13. ответы 500 подряд: следующие попытки через 1, 2 и 4 минуты, до срока запрос не отправляется", async () => {
    const { page } = await userWithLinkedTask(fake);
    fake.pages.failWrites(notionFailures.serverError, 4);
    await cronAt(atMinute(0));

    expect(fake.pages.updates(page)).toHaveLength(1);
    await expectNextAttemptAt(page, 1);
    await expectNextAttemptAt(page, 3);
    await expectNextAttemptAt(page, 7);
  });
});

describe("страница в корзине", () => {
  it("15. 400 на PATCH, затем GET страницы с in_trash: true: задача в архиве, её таймер остановлен", async () => {
    const { session, task, page } = await userWithTaskPage(fake);
    await startTimer(session, task.id, atMinute(1));
    fake.pages.trash(page);
    const updates = await fake.updatesDuring(page, () => cronAt(atMinute(1)));

    expect(updates).toHaveLength(1);
    expect(await readTask(session, task.id, atMinute(2))).toMatchObject({
      archived: true,
      runningSessionId: null,
    });
  });
});

describe("отозванный доступ", () => {
  it("16. 401 и неудачное обновление токена: подключение needs_reauth, pendingTasks > 0", async () => {
    const { session } = await userWithLinkedTask(fake);
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
  it("17. 400 validation_error на PATCH страницы не из корзины: задача в failed с текстом ошибки", async () => {
    const { session, task } = await rejectedTask();

    expect(await syncStatus(session, atMinute(0))).toMatchObject({
      failed: [
        { taskId: task.id, title: TASK_TITLE, error: expect.stringMatching(/\S/), attempts: 10 },
      ],
    });
  });

  it("17. POST /api/notion/sync/retry возвращает задачу в очередь, следующий cron отправляет PATCH страницы", async () => {
    const { session, page } = await rejectedTask();

    expect(await retrySync(session, atMinute(1))).toMatchObject({ status: 204 });
    expect(await syncStatus(session, atMinute(1))).toMatchObject({ pendingTasks: 1, failed: [] });
    expect(await fake.updatesDuring(page, () => cronAt(atMinute(1)))).toHaveLength(1);
  });
});
