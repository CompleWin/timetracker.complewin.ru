import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCall, TestSession } from "./harness/index.ts";
import { expectValidationError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import {
  fakeNotionPull,
  filterConditionsOf,
  linkPage,
  queryBodyOf,
  queryUrlOf,
  searchPages,
  statusProperty,
  userWithDatabase,
  type FakeNotionPull,
  type PageSearch,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import {
  FUN_DATABASE,
  TASKS_DATABASE,
  callsDuring,
  loginForSync,
  titlePropertyId,
  type DatabaseSetup,
} from "./harness/notion-sync.ts";
import type { FakeDataSource } from "./harness/notion-workspace.ts";
import { onlyCall } from "./harness/notion.ts";
import { MISSING_ID } from "./harness/rest.ts";

const STATUS = "Статус";
const QUERY_TEXT = "Anki";
const SEARCH_TIME = atMinute(5);
const WITH_STATUS: DatabaseSetup = {
  ...TASKS_DATABASE,
  properties: [
    statusProperty(STATUS, {
      "To-do": ["Не начато"],
      "In progress": ["В работе"],
      Complete: ["Review", "Done"],
    }),
  ],
};

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function searchSucceeds(session: TestSession, search: PageSearch): Promise<void> {
  expect(await searchPages(session, search, SEARCH_TIME)).toMatchObject({ status: 200 });
}

async function searchQuery(session: TestSession, search: PageSearch): Promise<ExternalCall> {
  return onlyCall(await fake.queriesDuring(() => searchSucceeds(session, search)));
}

function schemaReadsDuringSearch(
  { session, added }: UserWithDatabase,
  search: PageSearch,
): Promise<ExternalCall[]> {
  return callsDuring(
    () => fake.workspace.dataSourceReads(added.dataSource),
    () => searchSucceeds(session, search),
  );
}

function titleContains(dataSource: FakeDataSource, text: string): Record<string, unknown> {
  return { property: titlePropertyId(dataSource), title: { contains: text } };
}

function statusIsNot(dataSource: FakeDataSource, option: string): Record<string, unknown> {
  const property = fake.workspace.property(dataSource, STATUS).id;
  return { property, status: { does_not_equal: option } };
}

describe("фильтр поиска", () => {
  it("1. поиск с q=Anki в базе со status-полем: в query уходит and из title.contains и двух does_not_equal по вариантам группы Complete", async () => {
    const { session, added } = await userWithDatabase(fake, WITH_STATUS);
    const source = added.dataSource;
    const query = await searchQuery(session, { q: QUERY_TEXT });

    expect(query.url).toBe(queryUrlOf(source));
    expect(queryBodyOf(query)).toMatchObject({
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 20,
    });
    expect(filterConditionsOf(query)).toHaveLength(3);
    expect(filterConditionsOf(query)).toEqual(
      expect.arrayContaining([
        titleContains(source, QUERY_TEXT),
        statusIsNot(source, "Review"),
        statusIsNot(source, "Done"),
      ]),
    );
  });

  it("2. includeCompleted=true не добавляет условий по статусу", async () => {
    const { session, added } = await userWithDatabase(fake, WITH_STATUS);
    const query = await searchQuery(session, { q: QUERY_TEXT, includeCompleted: true });

    expect(filterConditionsOf(query)).toEqual([titleContains(added.dataSource, QUERY_TEXT)]);
  });

  it("2. без status-поля условий по статусу нет", async () => {
    const { session, added } = await userWithDatabase(fake);
    const query = await searchQuery(session, { q: QUERY_TEXT, includeCompleted: false });

    expect(filterConditionsOf(query)).toEqual([titleContains(added.dataSource, QUERY_TEXT)]);
  });

  it("2. без status-поля и без q фильтр не передаётся", async () => {
    const { session } = await userWithDatabase(fake);
    const query = await searchQuery(session, {});

    expect(queryBodyOf(query)).not.toHaveProperty("filter");
  });
});

describe("схема базы для условий по статусу", () => {
  it("17. поиск с includeCompleted=true не отправляет GET /v1/data_sources/{id}", async () => {
    const user = await userWithDatabase(fake, WITH_STATUS);

    expect(await schemaReadsDuringSearch(user, { includeCompleted: true })).toEqual([]);
  });

  it("17. поиск без includeCompleted=true читает схему через GET /v1/data_sources/{id}", async () => {
    const user = await userWithDatabase(fake, WITH_STATUS);

    expect(await schemaReadsDuringSearch(user, {})).toHaveLength(1);
  });
});

describe("в какую базу уходит поиск", () => {
  it("3. без databaseId запрос идёт в базу по умолчанию, с databaseId второй базы в её data source", async () => {
    const session = await loginForSync();
    const { tasks, fun } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
    });

    expect(tasks.database).toMatchObject({ isDefault: true });
    expect((await searchQuery(session, {})).url).toBe(queryUrlOf(tasks.dataSource));
    expect((await searchQuery(session, { databaseId: fun.database.id })).url).toBe(
      queryUrlOf(fun.dataSource),
    );
  });

  it("3. без базы по умолчанию и без databaseId ответ 400 с полем databaseId", async () => {
    const { session } = await userWithDatabase(fake, { ...TASKS_DATABASE, isDefault: false });

    expectValidationError(await searchPages(session, {}, SEARCH_TIME), ["databaseId"]);
  });

  it("3. неизвестный databaseId даёт 400 с полем databaseId", async () => {
    const { session } = await userWithDatabase(fake);

    expectValidationError(await searchPages(session, { databaseId: MISSING_ID }, SEARCH_TIME), [
      "databaseId",
    ]);
  });
});

describe("страницы в ответе", () => {
  it("4. уже связанная страница возвращается с linkedTaskId, несвязанная с null", async () => {
    const { session, added } = await userWithDatabase(fake);
    const anki = fake.pageInNotion(added.dataSource, { title: "Anki", editedAt: atMinute(1) });
    const chess = fake.pageInNotion(added.dataSource, { title: "Шахматы", editedAt: atMinute(2) });
    const task = await linkPage(session, anki.id, {}, atMinute(3));

    expect(await searchPages(session, {}, SEARCH_TIME)).toMatchObject({
      status: 200,
      body: {
        pages: expect.arrayContaining([
          expect.objectContaining({
            pageId: anki.id,
            title: "Anki",
            url: anki.url,
            linkedTaskId: task.id,
          }),
          expect.objectContaining({
            pageId: chess.id,
            title: "Шахматы",
            url: chess.url,
            linkedTaskId: null,
          }),
        ]),
      },
    });
  });
});
