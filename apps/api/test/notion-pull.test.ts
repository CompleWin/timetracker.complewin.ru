import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCall, TestSession } from "./harness/index.ts";
import { atClock, atMinute } from "./harness/clock.ts";
import { notionFailures, type FakePage } from "./harness/notion-pages.ts";
import {
  cursorOf,
  fakeNotionPull,
  linkPage,
  queryBodyOf,
  queryUrlOf,
  sendsProperty,
  userWithDatabase,
  type FakeNotionPull,
} from "./harness/notion-pull.ts";
import {
  FUN_DATABASE,
  TASKS_DATABASE,
  cronAt,
  loginForSync,
  pagePropertiesOf,
  readTask,
  titlePropertyId,
  titleValue,
} from "./harness/notion-sync.ts";
import { userWithTaskPage, type UserWithTaskPage } from "./harness/notion-task-pages.ts";
import type { FakeDataSource } from "./harness/notion-workspace.ts";
import { onlyCall } from "./harness/notion.ts";
import { updateTask } from "./harness/tasks.ts";

const RENAMED_IN_NOTION = "Anki: испанский";
const TRACKER_TITLE = "Anki: трекер";
const NOTION_TITLE = "Anki: Notion";
const CONFLICT_RUN = atClock("12:10");
const RATE_LIMIT_RETRY_AFTER_SEC = 30;

type TitleConflict = {
  user: UserWithTaskPage;
  updates: ExternalCall[];
};

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

function sendsTitle(user: UserWithTaskPage): (call: ExternalCall) => boolean {
  return (call) => sendsProperty(call, titlePropertyId(user.tasks.dataSource));
}

async function renamedInNotion(): Promise<UserWithTaskPage> {
  const user = await userWithTaskPage(fake);
  fake.editInNotion(user.page, { title: RENAMED_IN_NOTION, editedAt: atMinute(10) });
  return user;
}

async function titleConflict(trackerAt: string, notionAt: string): Promise<TitleConflict> {
  const user = await userWithTaskPage(fake);
  await updateTask(user.session, user.task.id, { title: TRACKER_TITLE }, atClock(trackerAt));
  fake.editInNotion(user.page, { title: NOTION_TITLE, editedAt: atClock(notionAt) });
  const updates = await fake.updatesDuring(user.page, () => cronAt(CONFLICT_RUN));
  return { user, updates };
}

async function linkedPage(
  session: TestSession,
  dataSource: FakeDataSource,
  title: string,
  editedAt: { now: string },
): Promise<FakePage> {
  const page = fake.pageInNotion(dataSource, { title, editedAt });
  await linkPage(session, page.id, {}, editedAt);
  return page;
}

function queryTo(queries: ExternalCall[], dataSource: FakeDataSource): ExternalCall {
  return onlyCall(queries.filter((call) => call.url === queryUrlOf(dataSource)));
}

function minuteMs(minute: number): number {
  return Date.parse(atMinute(minute).now);
}

describe("название из Notion", () => {
  it("12. страница переименована в Notion, а в трекере название не менялось: после cron задача называется по-новому", async () => {
    const { session, task } = await renamedInNotion();
    await cronAt(atMinute(10));

    expect(await readTask(session, task.id, atMinute(10))).toMatchObject({
      title: RENAMED_IN_NOTION,
    });
  });

  it("12. принятое из Notion название ни этот, ни следующий cron обратно не отправляют", async () => {
    const user = await renamedInNotion();
    const updates = await fake.updatesDuring(user.page, async () => {
      await cronAt(atMinute(10));
      await cronAt(atMinute(20));
    });

    expect(updates.filter(sendsTitle(user))).toEqual([]);
  });

  it("13. название сменили в трекере в 12:00, а last_edited_time страницы 12:05: побеждает Notion", async () => {
    const { user, updates } = await titleConflict("12:00", "12:05");

    expect(await readTask(user.session, user.task.id, CONFLICT_RUN)).toMatchObject({
      title: NOTION_TITLE,
    });
    expect(updates.filter(sendsTitle(user))).toEqual([]);
  });

  it("13. название сменили в трекере в 12:05, а last_edited_time страницы 12:00: побеждает трекер, push отправляет его название", async () => {
    const { user, updates } = await titleConflict("12:05", "12:00");

    expect(await readTask(user.session, user.task.id, CONFLICT_RUN)).toMatchObject({
      title: TRACKER_TITLE,
    });
    expect(pagePropertiesOf(onlyCall(updates))).toMatchObject({
      [titlePropertyId(user.tasks.dataSource)]: titleValue(TRACKER_TITLE),
    });
  });
});

describe("расписание pull", () => {
  it("14. cron через 3 минуты после прошлого pull не отправляет query", async () => {
    await userWithDatabase(fake);
    const first = await fake.queriesDuring(() => cronAt(atMinute(0)));
    const second = await fake.queriesDuring(() => cronAt(atMinute(3)));

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  it("14. cron через 5 минут после прошлого pull снова отправляет query", async () => {
    await userWithDatabase(fake);
    await cronAt(atMinute(0));

    expect(await fake.queriesDuring(() => cronAt(atMinute(5)))).toHaveLength(1);
  });

  it("15. первый query pull идёт без filter, с сортировкой по last_edited_time по возрастанию и page_size 100", async () => {
    const { added } = await userWithDatabase(fake);
    const query = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(1))));

    expect(query.url).toBe(queryUrlOf(added.dataSource));
    expect(queryBodyOf(query)).not.toHaveProperty("filter");
    expect(queryBodyOf(query)).toMatchObject({
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: 100,
    });
  });

  it("15. второй проход после пустого первого: фильтр on_or_after = момент первого прохода минус 2 минуты", async () => {
    await userWithDatabase(fake);
    await cronAt(atMinute(1));
    const query = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(6))));

    expect(queryBodyOf(query)).toMatchObject({
      filter: {
        timestamp: "last_edited_time",
        last_edited_time: { on_or_after: expect.any(String) },
      },
    });
    expect(cursorOf(query)).toBe(minuteMs(-1));
  });

  it("15. две базы: первый query каждой без filter, со второго прохода у каждой on_or_after = её максимальный last_edited_time минус 2 минуты", async () => {
    const session = await loginForSync();
    const { tasks, fun } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
    });
    await linkedPage(session, tasks.dataSource, "Anki", atMinute(12));
    await linkedPage(session, tasks.dataSource, "Шахматы", atMinute(20));
    await linkedPage(session, fun.dataSource, "Ведьмак", atMinute(30));
    const firstQueries = await fake.queriesDuring(() => cronAt(atMinute(40)));
    const queries = await fake.queriesDuring(() => cronAt(atMinute(50)));

    expect(firstQueries).toHaveLength(2);
    for (const query of firstQueries) {
      expect(queryBodyOf(query)).not.toHaveProperty("filter");
    }
    expect(queries).toHaveLength(2);
    expect(cursorOf(queryTo(queries, tasks.dataSource))).toBe(minuteMs(18));
    expect(cursorOf(queryTo(queries, fun.dataSource))).toBe(minuteMs(28));
  });
});

describe("ошибки pull", () => {
  it("16. 429 на query: курсор не меняется, следующий запуск повторяет запрос с тем же on_or_after", async () => {
    const { session, added } = await userWithDatabase(fake);
    await linkedPage(session, added.dataSource, "Anki", atMinute(20));
    await cronAt(atMinute(30));
    fake.failQueries(notionFailures.rateLimited(RATE_LIMIT_RETRY_AFTER_SEC));
    const failed = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(40))));
    const repeated = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(41))));

    expect(cursorOf(failed)).toBe(minuteMs(18));
    expect(cursorOf(repeated)).toBe(minuteMs(18));
  });
});
