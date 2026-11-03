import { beforeEach, describe, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import type { TestResponse, TestSession } from "./harness/index.ts";
import {
  addDatabase,
  databaseBody,
  deleteDatabase,
  listAvailableDatabases,
  listAvailableProperties,
  patchDatabase,
  postDatabase,
  type TestNotionDatabase,
} from "./harness/notion-databases.ts";
import {
  fakeNotionWorkspace,
  type FakeDataSource,
  type FakeNotionWorkspace,
} from "./harness/notion-workspace.ts";
import {
  checkNotionConnection,
  disconnectNotion,
  expectConnection,
  fakeNotion,
  loginWithNotion,
  type FakeNotion,
} from "./harness/notion.ts";
import { requireStatus } from "./harness/rest.ts";

type UserWithDatabase = {
  session: TestSession;
  added: FakeDataSource;
  database: TestNotionDatabase;
  notAdded: FakeDataSource;
};

type DatabaseRequest = [string, (user: UserWithDatabase) => Promise<TestResponse>];

const databaseRequests: DatabaseRequest[] = [
  ["GET /api/notion/available-databases", ({ session }) => listAvailableDatabases(session)],
  [
    "GET /api/notion/available-databases/:dataSourceId/properties",
    ({ session, added }) => listAvailableProperties(session, added.id),
  ],
  [
    "POST /api/notion/databases",
    ({ session, notAdded }) => postDatabase(session, databaseBody(notAdded)),
  ],
  [
    "PATCH /api/notion/databases/:id",
    ({ session, database }) => patchDatabase(session, database.id, { blockPosition: "end" }),
  ],
  [
    "DELETE /api/notion/databases/:id",
    ({ session, database }) => deleteDatabase(session, database.id),
  ],
];

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

async function userWithDatabase(): Promise<UserWithDatabase> {
  const { session } = await loginWithNotion(notion);
  const added = workspace.dataSource({ title: ["Задачи"] });
  const database = await addDatabase(session, added);
  const notAdded = workspace.dataSource({ title: ["Развлечения"] });
  return { session, added, database, notAdded };
}

async function loseNotionAccess(session: TestSession): Promise<void> {
  notion.expireAccessTokens();
  notion.rejectRefresh();
  expectConnection(await checkNotionConnection(session), { status: "needs_reauth" });
}

describe("эндпоинты баз требуют рабочего подключения", () => {
  it.each(databaseRequests)(
    "18. %s при needs_reauth отвечает 409 notion_reauth_required",
    async (_, send) => {
      const user = await userWithDatabase();
      await loseNotionAccess(user.session);

      expectApiError(await send(user), "notion_reauth_required");
    },
  );

  it.each(databaseRequests)(
    "18. %s после отключения Notion отвечает 404 not_found",
    async (_, send) => {
      const user = await userWithDatabase();
      requireStatus(await disconnectNotion(user.session), 204, "DELETE /api/notion/connection");

      expectApiError(await send(user), "not_found");
    },
  );
});
