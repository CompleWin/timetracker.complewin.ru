import { beforeEach, describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import { api, type TestResponse, type TestSession } from "./harness/index.ts";
import { addDatabase, type TestNotionDatabase } from "./harness/notion-databases.ts";
import { fakeNotionWorkspace, type FakeNotionWorkspace } from "./harness/notion-workspace.ts";
import { fakeNotion, loginWithNotion, type FakeNotion } from "./harness/notion.ts";
import { createProject, getProject, projectPath, updateProject } from "./harness/projects.ts";
import { MISSING_ID } from "./harness/rest.ts";

type UserWithDatabase = {
  session: TestSession;
  database: TestNotionDatabase;
};

type InvalidDatabaseId = [string, () => Promise<string>];

const OWNER_ID = 1;
const STRANGER_ID = 2;

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

const invalidDatabaseIds: InvalidDatabaseId[] = [
  ["чужой базы", strangerDatabaseId],
  ["несуществующей базы", async () => MISSING_ID],
  ["неверного формата", async () => "not-a-uuid"],
];

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

async function userWithDatabase(telegramId: number): Promise<UserWithDatabase> {
  const { session } = await loginWithNotion(notion, { telegramId });
  const database = await addDatabase(session, workspace.dataSource());
  return { session, database };
}

async function strangerDatabaseId(): Promise<string> {
  const { database } = await userWithDatabase(STRANGER_ID);
  return database.id;
}

function postProject(session: TestSession, body: unknown): Promise<TestResponse> {
  return api.post("/api/projects", body, { as: session });
}

function patchProject(session: TestSession, id: string, body: unknown): Promise<TestResponse> {
  return api.patch(projectPath(id), body, { as: session });
}

describe("привязка проекта к базе Notion", () => {
  it("15. проект без notionDatabaseId получает null", async () => {
    const { session } = await userWithDatabase(OWNER_ID);

    expect(await createProject(session, { name: "Работа" })).toMatchObject({
      notionDatabaseId: null,
    });
  });

  it("15. POST /api/projects с ID своей базы сохраняет привязку", async () => {
    const { session, database } = await userWithDatabase(OWNER_ID);
    const project = await createProject(session, {
      name: "Работа",
      notionDatabaseId: database.id,
    });

    expect(await getProject(session, project.id)).toMatchObject({
      status: 200,
      body: { project: { notionDatabaseId: database.id } },
    });
  });

  it("15. PATCH /api/projects/:id с ID своей базы сохраняет привязку", async () => {
    const { session, database } = await userWithDatabase(OWNER_ID);
    const project = await createProject(session, { name: "Работа" });

    expect(
      await patchProject(session, project.id, { notionDatabaseId: database.id }),
    ).toMatchObject({
      status: 200,
      body: { project: { id: project.id, notionDatabaseId: database.id } },
    });
    expect(await getProject(session, project.id)).toMatchObject({
      status: 200,
      body: { project: { notionDatabaseId: database.id } },
    });
  });

  it("15. PATCH /api/projects/:id с notionDatabaseId null снимает привязку", async () => {
    const { session, database } = await userWithDatabase(OWNER_ID);
    const project = await createProject(session, {
      name: "Работа",
      notionDatabaseId: database.id,
    });

    expect(await updateProject(session, project.id, { notionDatabaseId: null })).toMatchObject({
      notionDatabaseId: null,
    });
  });

  it.each(invalidDatabaseIds)(
    "15. PATCH /api/projects/:id с ID %s даёт 400 с полем notionDatabaseId",
    async (_, databaseIdOf) => {
      const { session } = await userWithDatabase(OWNER_ID);
      const project = await createProject(session, { name: "Работа" });
      const notionDatabaseId = await databaseIdOf();

      expectValidationError(await patchProject(session, project.id, { notionDatabaseId }), [
        "notionDatabaseId",
      ]);
    },
  );

  it.each(invalidDatabaseIds)(
    "15. POST /api/projects с ID %s даёт 400 с полем notionDatabaseId",
    async (_, databaseIdOf) => {
      const { session } = await userWithDatabase(OWNER_ID);
      const notionDatabaseId = await databaseIdOf();

      expectValidationError(await postProject(session, { name: "Работа", notionDatabaseId }), [
        "notionDatabaseId",
      ]);
    },
  );
});
