import { beforeEach, describe, it } from "vitest";
import type { TestResponse, TestSession } from "./harness/index.ts";
import { OWN_MODE_FIELDS, trackerFieldSpecs } from "./harness/notion-databases.ts";
import { fakeNotionWorkspace, type FakeNotionWorkspace } from "./harness/notion-workspace.ts";
import {
  expectConnected,
  expectConnection,
  fakeNotion,
  getNotionConnection,
  type FakeNotion,
} from "./harness/notion.ts";
import { MISSING_ID } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";

type BrokenTemplate = [string, () => string];

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

const brokenTemplates: BrokenTemplate[] = [
  ["страница шаблона не находится в Notion", () => MISSING_ID],
  ["в шаблоне нет блока child_database", () => workspace.pageWithoutDatabases()],
];

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

async function connectWithTemplate(
  session: TestSession,
  duplicatedTemplateId: string,
): Promise<TestResponse> {
  const attempt = await notion.start({ as: session });
  return notion.callback(attempt, { as: session }, { duplicatedTemplateId });
}

describe("автонастройка из шаблона", () => {
  it("16. callback с duplicated_template_id добавляет первую базу шаблона с own, start и isDefault = true", async () => {
    const { session } = await loginAs({ locale: "ru" });
    const tasks = workspace.dataSource({
      title: ["Задачи"],
      properties: trackerFieldSpecs("ru", OWN_MODE_FIELDS),
    });
    const response = await connectWithTemplate(session, workspace.templatePage(tasks));

    expectConnected(response);
    expectConnection(await getNotionConnection(session), {
      status: "ok",
      databases: [
        {
          dataSourceId: tasks.id,
          databaseId: tasks.databaseId,
          title: "Задачи",
          projectMode: "own",
          projectProperty: null,
          blockPosition: "start",
          isDefault: true,
        },
      ],
    });
  });

  it.each(brokenTemplates)(
    "17. %s: callback ведёт на notion=connected, баз нет",
    async (_, templateId) => {
      const { session } = await loginAs({ locale: "ru" });
      const response = await connectWithTemplate(session, templateId());

      expectConnected(response);
      expectConnection(await getNotionConnection(session), { status: "ok", databases: [] });
    },
  );
});
