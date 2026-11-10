import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import { atMinute } from "./harness/clock.ts";
import {
  DONE,
  IMPORT_RUN,
  IN_PROGRESS,
  NEXT_RUN,
  PAGE_EDIT,
  TASKS_BASE,
  TASKS_BASE_WITH_STATUS,
  activeTasks,
  filterOf,
  pageIn,
  pagesIn,
  rejectedCursor,
  startCursorOf,
  taskOfPage,
  withStatus,
} from "./harness/notion-import.ts";
import type { FakePage } from "./harness/notion-pages.ts";
import {
  cursorOf,
  fakeNotionPull,
  queryUrlOf,
  userWithDatabase,
  type FakeNotionPull,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import { cronAt, loginForSync, type DatabaseSetup } from "./harness/notion-sync.ts";
import { linkedTask } from "./harness/notion-task-pages.ts";
import { checkNotionConnection, expectConnection, onlyCall } from "./harness/notion.ts";

const BULK_TIMEOUT_MS = 120_000;
const PAGES_PER_QUERY = 100;
const LARGE_BASE_PAGES = 250;
const SAME_TIME_PAGES = 550;
const SAME_TIME_PASS_CURSORS = [undefined, "100", "200", "300", "400", "500"];
const QUERIES_PER_RUN = 5;
const REQUESTS_PER_RUN = 100;
const QUEUED_TASKS = 105;
const FIRST_RUN = atMinute(1);
const SECOND_RUN = atMinute(2);
const THIRD_RUN = atMinute(3);
const FUN_BASE: DatabaseSetup = { title: "Fun", projectMode: "none" };

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

function minuteMs(minute: number): number {
  return Date.parse(atMinute(minute).now);
}

async function largeBase(pages: number): Promise<UserWithDatabase> {
  const user = await userWithDatabase(fake, TASKS_BASE);
  pagesIn(fake, user.added, pages, (index) => atMinute(index + 1 - pages));
  return user;
}

async function taskCount(session: TestSession, time: { now: string }): Promise<number> {
  return (await activeTasks(session, time)).length;
}

function skippedPagesThenOne({ added }: UserWithDatabase, editedAt: { now: string }): FakePage {
  const skipped = withStatus(added.dataSource, DONE);
  const title = (index: number): string => `Завершённая ${index + 1}`;
  Array.from({ length: SAME_TIME_PAGES - 1 }, (_, index) =>
    pageIn(fake, added, title(index), skipped, editedAt),
  );
  return pageIn(fake, added, "Последняя", withStatus(added.dataSource, IN_PROGRESS), editedAt);
}

async function finishedPassOverSameTimePages() {
  const user = await userWithDatabase(fake, TASKS_BASE_WITH_STATUS);
  await cronAt(atMinute(0));
  const last = skippedPagesThenOne(user, atMinute(6));
  const first = await fake.queriesDuring(() => cronAt(atMinute(7)));
  const second = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(8))));
  return { user, last, first, second };
}

describe("база на 250 страниц", () => {
  it(
    "20. первый cron создаёт 100 задач и отправляет один query",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const { session } = await largeBase(LARGE_BASE_PAGES);
      const requests = await fake.requestsDuring(() => cronAt(FIRST_RUN));

      expect(onlyCall(requests).url).toMatch(/\/query$/);
      expect(await taskCount(session, FIRST_RUN)).toBe(PAGES_PER_QUERY);
    },
  );

  it(
    "20. второй и третий cron продолжают по start_cursor без паузы в 5 минут, всего создано 250 задач",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const { session } = await largeBase(LARGE_BASE_PAGES);
      await cronAt(FIRST_RUN);
      const second = onlyCall(await fake.queriesDuring(() => cronAt(SECOND_RUN)));
      const third = onlyCall(await fake.queriesDuring(() => cronAt(THIRD_RUN)));

      expect(startCursorOf(second)).toBe("100");
      expect(startCursorOf(third)).toBe("200");
      expect(filterOf(second)).toBeUndefined();
      expect(filterOf(third)).toBeUndefined();
      expect(await taskCount(session, THIRD_RUN)).toBe(LARGE_BASE_PAGES);
    },
  );

  it(
    "20. следующий cron идёт через 5 минут с on_or_after = максимальный last_edited_time минус 2 минуты",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      await largeBase(LARGE_BASE_PAGES);
      await cronAt(FIRST_RUN);
      await cronAt(SECOND_RUN);
      await cronAt(THIRD_RUN);
      const tooEarly = await fake.queriesDuring(() => cronAt(atMinute(7)));
      const query = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(8))));

      expect(tooEarly).toEqual([]);
      expect(cursorOf(query)).toBe(minuteMs(-2));
      expect(startCursorOf(query)).toBeUndefined();
    },
  );
});

describe("больше 500 страниц с одинаковым last_edited_time", () => {
  it(
    "21. полный проход доходит до конца за два запуска и не читает страницы заново",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const user = await userWithDatabase(fake, TASKS_BASE_WITH_STATUS);
      const last = skippedPagesThenOne(user, PAGE_EDIT);
      const first = await fake.queriesDuring(() => cronAt(FIRST_RUN));
      const second = await fake.queriesDuring(() => cronAt(SECOND_RUN));

      expect([...first, ...second].map(startCursorOf)).toEqual(SAME_TIME_PASS_CURSORS);
      expect(first).toHaveLength(QUERIES_PER_RUN);
      expect(await taskOfPage(user.session, last, SECOND_RUN)).toMatchObject({
        title: "Последняя",
      });
    },
  );

  it(
    "21. обычный проход продолжается с next_cursor с тем же фильтром, курсор внутри прохода не двигается",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const { user, last, first, second } = await finishedPassOverSameTimePages();

      expect(first).toHaveLength(QUERIES_PER_RUN);
      expect(startCursorOf(second)).toBe("500");
      expect(new Set([...first, second].map(cursorOf))).toEqual(new Set([minuteMs(-2)]));
      expect(await taskOfPage(user.session, last, atMinute(8))).toMatchObject({
        title: "Последняя",
      });
    },
  );

  it(
    "21. следующий проход идёт с on_or_after = этот last_edited_time минус 2 минуты, снова читает страницы по next_cursor и не создаёт дублей",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const { user } = await finishedPassOverSameTimePages();
      const first = await fake.queriesDuring(() => cronAt(atMinute(13)));
      const second = await fake.queriesDuring(() => cronAt(atMinute(14)));
      const nextPass = [...first, ...second];

      expect(nextPass.map(startCursorOf)).toEqual(SAME_TIME_PASS_CURSORS);
      expect(new Set(nextPass.map(cursorOf))).toEqual(new Set([minuteMs(4)]));
      expect(await taskCount(user.session, atMinute(14))).toBe(1);
    },
  );
});

describe("отклонённый next_cursor", () => {
  it(
    "22. ответ 400 на сохранённый next_cursor: проход начинается заново, дублей нет",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const { session } = await largeBase(PAGES_PER_QUERY + 50);
      await cronAt(FIRST_RUN);
      fake.failQueries(rejectedCursor);
      const rejected = await fake.queriesDuring(() => cronAt(SECOND_RUN));
      const restarted = await fake.queriesDuring(() => cronAt(THIRD_RUN));
      const titles = (await activeTasks(session, THIRD_RUN)).map(({ title }) => title);

      expect([...rejected, ...restarted].map(startCursorOf)).toEqual(["100", undefined, "100"]);
      expect(titles).toHaveLength(PAGES_PER_QUERY + 50);
      expect(new Set(titles).size).toBe(titles.length);
    },
  );
});

describe("две базы с новыми страницами", () => {
  async function userWithTwoBases() {
    const session = await loginForSync();
    const databases = await fake.connectNotion(session, {
      databases: { tasks: TASKS_BASE, fun: FUN_BASE },
    });
    pageIn(fake, databases.tasks, "Anki");
    pageIn(fake, databases.fun, "Ведьмак");
    return { session, ...databases };
  }

  it("23. после страницы выборки первой базы pull заканчивается, вторая база читается в следующем запуске", async () => {
    const { session, tasks, fun } = await userWithTwoBases();
    const first = onlyCall(await fake.queriesDuring(() => cronAt(IMPORT_RUN)));
    const importedFirst = await taskCount(session, IMPORT_RUN);
    const second = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(11))));

    expect([first.url, second.url].toSorted()).toEqual(
      [queryUrlOf(tasks.dataSource), queryUrlOf(fun.dataSource)].toSorted(),
    );
    expect(importedFirst).toBe(1);
    expect(await taskCount(session, atMinute(11))).toBe(2);
  });

  it("23. push в запуске, где pull закончился раньше, выполняется", async () => {
    const { session, tasks } = await userWithTwoBases();
    const { page } = await linkedTask(fake, session, tasks, { title: "Связанная" });
    const updates = await fake.updatesDuring(page, () => cronAt(IMPORT_RUN));

    expect(updates).toHaveLength(1);
  });
});

describe("подключение и лимиты", () => {
  it("28. при needs_reauth импорт не срабатывает: query не уходит, задач нет", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    pageIn(fake, user.added, "Anki");
    fake.notion.expireAccessTokens();
    fake.notion.rejectRefresh();
    expectConnection(await checkNotionConnection(user.session, PAGE_EDIT), {
      status: "needs_reauth",
    });

    expect(await fake.queriesDuring(() => cronAt(IMPORT_RUN))).toEqual([]);
    expect(await activeTasks(user.session, IMPORT_RUN)).toEqual([]);
  });

  it(
    "28. лимит 100 запросов считает запросы импорта: query и push вместе укладываются в лимит, остальное уходит в следующем запуске",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const user = await userWithDatabase(fake, TASKS_BASE);
      for (let number = 1; number <= QUEUED_TASKS; number += 1) {
        await linkedTask(fake, user.session, user.added, { title: `Задача ${number}` });
      }
      const page = pageIn(fake, user.added, "Anki");
      const firstRun = await fake.requestsDuring(() => cronAt(IMPORT_RUN));
      const imported = await taskOfPage(user.session, page, IMPORT_RUN);
      await cronAt(NEXT_RUN);

      expect(firstRun.length).toBeLessThanOrEqual(REQUESTS_PER_RUN);
      expect(imported).toMatchObject({ title: "Anki" });
      expect(fake.pages.updates()).toHaveLength(QUEUED_TASKS);
    },
  );
});
