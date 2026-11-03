import { beforeEach, describe, expect, it } from "vitest";
import type { TestResponse } from "./harness/index.ts";
import {
  addDatabase,
  listAvailableDatabases,
  listAvailableProperties,
  type AvailableDatabase,
  type TestProjectProperty,
} from "./harness/notion-databases.ts";
import {
  fakeNotionWorkspace,
  type FakeDataSource,
  type FakeNotionWorkspace,
} from "./harness/notion-workspace.ts";
import { fakeNotion, jsonBodyOf, loginWithNotion, type FakeNotion } from "./harness/notion.ts";

const CLAPPER = "\u{1F3AC}";
const MAX_SEARCH_PAGES = 5;
const DATA_SOURCE_SEARCH = {
  filter: { property: "object", value: "data_source" },
  page_size: 100,
};

type ExpectedDatabase = Omit<AvailableDatabase, "icon"> & Partial<Pick<AvailableDatabase, "icon">>;

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

function available(
  dataSource: FakeDataSource,
  title: string,
  addedId: string | null = null,
): ExpectedDatabase {
  return { dataSourceId: dataSource.id, databaseId: dataSource.databaseId, title, addedId };
}

function byTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.title.localeCompare(right.title));
}

function byName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function expectAvailableDatabases(response: TestResponse, expected: ExpectedDatabase[]): void {
  expect(response).toMatchObject({ status: 200, body: { databases: expect.any(Array) } });
  const databases: AvailableDatabase[] = response.body.databases;
  expect(byTitle(databases)).toMatchObject(byTitle(expected));
}

describe("GET /api/notion/available-databases", () => {
  it("1. собирает базы из двух страниц поиска, addedId заполнен только у добавленной базы", async () => {
    const { session } = await loginWithNotion(notion);
    const tasks = workspace.dataSource({ title: ["Задачи"] });
    const fun = workspace.dataSource({ title: ["Развлечения"] });
    const books = workspace.dataSource({ title: ["Книги"] });
    workspace.splitSearch([tasks, fun], [books]);
    const added = await addDatabase(session, fun);

    expectAvailableDatabases(await listAvailableDatabases(session), [
      available(tasks, "Задачи"),
      available(fun, "Развлечения", added.id),
      available(books, "Книги"),
    ]);
  });

  it("1. оба запроса поиска фильтруют data_source с page_size 100, второй идёт с start_cursor", async () => {
    const { session } = await loginWithNotion(notion);
    const tasks = workspace.dataSource({ title: ["Задачи"] });
    const books = workspace.dataSource({ title: ["Книги"] });
    workspace.splitSearch([tasks], [books]);
    await listAvailableDatabases(session);

    expect(workspace.searchRequests().map(jsonBodyOf)).toMatchObject([
      DATA_SOURCE_SEARCH,
      { ...DATA_SOURCE_SEARCH, start_cursor: expect.stringMatching(/\S/) },
    ]);
  });

  it("1. title склеен из plain_text, icon равен emoji или null", async () => {
    const { session } = await loginWithNotion(notion);
    const movies = workspace.dataSource({
      title: ["Фильмы", " и ", "сериалы"],
      icon: { type: "emoji", emoji: CLAPPER },
    });
    const links = workspace.dataSource({
      title: ["Ссылки"],
      icon: { type: "external", external: { url: "https://example.com/icon.png" } },
    });
    const notes = workspace.dataSource({ title: ["Заметки"], icon: null });

    expectAvailableDatabases(await listAvailableDatabases(session), [
      { ...available(movies, "Фильмы и сериалы"), icon: CLAPPER },
      { ...available(links, "Ссылки"), icon: null },
      { ...available(notes, "Заметки"), icon: null },
    ]);
  });

  it("1. по next_cursor запрашивает не больше 5 страниц поиска", async () => {
    const { session } = await loginWithNotion(notion);
    workspace.searchEndlessly();

    expect(await listAvailableDatabases(session)).toMatchObject({ status: 200 });
    expect(workspace.searchRequests()).toHaveLength(MAX_SEARCH_PAGES);
  });
});

describe("GET /api/notion/available-databases/:dataSourceId/properties", () => {
  it("5. возвращает только поля select и multi_select с id, name и type", async () => {
    const { session } = await loginWithNotion(notion);
    const tasks = workspace.dataSource({
      properties: [
        { name: "Направление", type: "select" },
        { name: "Теги", type: "multi_select" },
        { name: "Оценка", type: "number" },
        { name: "Статус", type: "status" },
        { name: "Описание", type: "rich_text" },
      ],
    });
    const response = await listAvailableProperties(session, tasks.id);
    const area = workspace.property(tasks, "Направление");
    const tags = workspace.property(tasks, "Теги");

    expect(response).toMatchObject({ status: 200, body: { properties: expect.any(Array) } });
    const properties: TestProjectProperty[] = response.body.properties;
    expect(byName(properties)).toMatchObject([
      { id: area.id, name: "Направление", type: "select" },
      { id: tags.id, name: "Теги", type: "multi_select" },
    ]);
  });
});
