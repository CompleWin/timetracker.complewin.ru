import { beforeEach, describe, expect, it } from "vitest";
import { expectApiError, expectValidationError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import {
  connectedDatabases,
  databaseBody,
  patchDatabase,
  postDatabase,
} from "./harness/notion-databases.ts";
import {
  fakeNotionPull,
  queryUrlOf,
  searchPages,
  userWithDatabase,
  type FakeNotionPull,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import { FUN_DATABASE, SETUP_TIME, TASKS_DATABASE, loginForSync } from "./harness/notion-sync.ts";
import { notionWorkspace, onlyCall } from "./harness/notion.ts";
import { requireStatus } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";

const OWNER_TELEGRAM_ID = 1001;
const STRANGER_TELEGRAM_ID = 1002;
const SEARCH_TIME = atMinute(5);

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function userWithOwnDatabase(telegramId: number): Promise<UserWithDatabase> {
  const { session } = await loginAs({ telegramId }, SETUP_TIME);
  const { added } = await fake.connectNotion(session, { databases: { added: TASKS_DATABASE } });
  return { session, added };
}

describe("у баз больше нет isDefault", () => {
  it("8. в ответах POST, PATCH и GET баз нет поля isDefault", async () => {
    const session = await loginForSync();
    await fake.notion.connect(session, notionWorkspace, SETUP_TIME);
    const posted = await postDatabase(
      session,
      databaseBody(fake.workspace.dataSource()),
      SETUP_TIME,
    );
    const { database } = requireStatus(posted, 201, "POST /api/notion/databases").body;
    const patched = await patchDatabase(session, database.id, { blockPosition: "end" }, SETUP_TIME);
    const listed = await connectedDatabases(session, SETUP_TIME);

    expect(database).not.toHaveProperty("isDefault");
    expect(patched).toMatchObject({ status: 200, body: { database: { id: database.id } } });
    expect(patched.body.database).not.toHaveProperty("isDefault");
    expect(listed).toMatchObject([{ id: database.id }]);
    expect(listed[0]).not.toHaveProperty("isDefault");
  });

  it("8. PATCH базы только с isDefault даёт 400", async () => {
    const { session, added } = await userWithDatabase(fake);

    expectApiError(
      await patchDatabase(session, added.database.id, { isDefault: true }, SETUP_TIME),
      "validation_error",
    );
  });
});

describe("поиск страниц без databaseId", () => {
  it("10. при двух базах поиск без databaseId идёт в первую по названию", async () => {
    const session = await loginForSync();
    const { tasks } = await fake.connectNotion(session, {
      databases: { fun: FUN_DATABASE, tasks: TASKS_DATABASE },
    });
    const queries = await fake.queriesDuring(() => searchPages(session, {}, SEARCH_TIME));

    expect(onlyCall(queries).url).toBe(queryUrlOf(tasks.dataSource));
  });

  it("10. чужой databaseId даёт 400 с полем databaseId", async () => {
    const owner = await userWithOwnDatabase(OWNER_TELEGRAM_ID);
    const stranger = await userWithOwnDatabase(STRANGER_TELEGRAM_ID);
    const response = await searchPages(
      owner.session,
      { databaseId: stranger.added.database.id },
      SEARCH_TIME,
    );

    expectValidationError(response, ["databaseId"]);
  });
});
