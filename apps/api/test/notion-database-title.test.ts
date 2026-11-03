import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import {
  addDatabase,
  listAvailableDatabases,
  type AvailableDatabase,
} from "./harness/notion-databases.ts";
import {
  fakeNotionWorkspace,
  type FakeDataSource,
  type FakeNotionWorkspace,
} from "./harness/notion-workspace.ts";
import { fakeNotion, loginWithNotion, type FakeNotion } from "./harness/notion.ts";
import { requireStatus } from "./harness/rest.ts";

type TitledDatabase = Pick<AvailableDatabase, "dataSourceId" | "title">;

type DatabaseTitleRequest = [
  string,
  (session: TestSession, dataSource: FakeDataSource) => Promise<TitledDatabase | undefined>,
];

const AVAILABLE_REQUEST = "GET /api/notion/available-databases";

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

async function availableDatabaseOf(
  session: TestSession,
  dataSource: FakeDataSource,
): Promise<AvailableDatabase | undefined> {
  const response = requireStatus(await listAvailableDatabases(session), 200, AVAILABLE_REQUEST);
  const databases: AvailableDatabase[] = response.body.databases;
  return databases.find((database) => database.dataSourceId === dataSource.id);
}

const databaseTitleRequests: DatabaseTitleRequest[] = [
  [AVAILABLE_REQUEST, availableDatabaseOf],
  ["POST /api/notion/databases", (session, dataSource) => addDatabase(session, dataSource)],
];

async function sessionWithNotion(): Promise<TestSession> {
  const { session } = await loginWithNotion(notion);
  return session;
}

function titled(dataSource: FakeDataSource, title: string): TitledDatabase {
  return { dataSourceId: dataSource.id, title };
}

describe("название базы для data source без своего названия", () => {
  it.each(databaseTitleRequests)(
    "20. %s: data source с пустым названием получает склеенное название своей базы",
    async (_, databaseOf) => {
      const session = await sessionWithNotion();
      const untitled = workspace.dataSource({
        title: [],
        databaseTitle: ["Задачи", " и ", "идеи"],
      });

      expect(await databaseOf(session, untitled)).toMatchObject(titled(untitled, "Задачи и идеи"));
    },
  );

  it.each(databaseTitleRequests)(
    "20. %s: data source с названием сохраняет его, запрос к /v1/databases не отправляется",
    async (_, databaseOf) => {
      const session = await sessionWithNotion();
      const books = workspace.dataSource({ title: ["Книги"], databaseTitle: ["Библиотека"] });

      expect(await databaseOf(session, books)).toMatchObject(titled(books, "Книги"));
      expect(workspace.databaseReads()).toEqual([]);
    },
  );

  it.each(databaseTitleRequests)(
    "20. %s: /v1/databases отвечает 404, title пустой",
    async (_, databaseOf) => {
      const session = await sessionWithNotion();
      const untitled = workspace.dataSource({ title: [], databaseTitle: ["Задачи"] });
      workspace.hideDatabase(untitled);

      expect(await databaseOf(session, untitled)).toMatchObject(titled(untitled, ""));
    },
  );
});
