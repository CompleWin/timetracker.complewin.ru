import { beforeEach, describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api } from "./harness/index.ts";
import {
  IMPORT_RUN,
  TASKS_BASE,
  TASKS_TITLE,
  onlyProjectNamed,
  pageIn,
} from "./harness/notion-import.ts";
import { fakeNotionPull, userWithDatabase, type FakeNotionPull } from "./harness/notion-pull.ts";
import { SETUP_TIME, cronAt } from "./harness/notion-sync.ts";
import { createProject, projectPath } from "./harness/projects.ts";

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

describe("проект и база Notion", () => {
  it("9. PATCH /api/projects/:id только с notionDatabaseId даёт 400", async () => {
    const { session, added } = await userWithDatabase(fake);
    const project = await createProject(session, { name: "Работа" }, SETUP_TIME);
    const response = await api.patch(
      projectPath(project.id),
      { notionDatabaseId: added.database.id },
      { ...SETUP_TIME, as: session },
    );

    expectApiError(response, "validation_error");
  });

  it("9. POST /api/projects с notionDatabaseId создаёт проект с notionDatabaseId = null", async () => {
    const { session, added } = await userWithDatabase(fake);
    const response = await api.post(
      "/api/projects",
      { name: "Работа", notionDatabaseId: added.database.id },
      { ...SETUP_TIME, as: session },
    );

    expect(response).toMatchObject({
      status: 201,
      body: { project: { name: "Работа", notionDatabaseId: null } },
    });
  });

  it("9. импорт по-прежнему привязывает проект базы", async () => {
    const { session, added } = await userWithDatabase(fake, TASKS_BASE);
    pageIn(fake, added, "Anki");
    await cronAt(IMPORT_RUN);

    expect(await onlyProjectNamed(session, TASKS_TITLE, IMPORT_RUN)).toMatchObject({
      notionDatabaseId: added.database.id,
    });
  });
});
