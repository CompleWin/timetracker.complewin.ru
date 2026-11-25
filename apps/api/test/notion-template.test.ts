import { beforeEach, describe, expect, it } from "vitest";
import { atMinute } from "./harness/clock.ts";
import type { TestResponse, TestSession } from "./harness/index.ts";
import { fakeNotionBlocks } from "./harness/notion-blocks.ts";
import {
  ALL_TRACKER_FIELDS,
  connectedDatabases,
  expectAddedFields,
  trackerFieldSpecs,
  updateDatabase,
  type TrackerField,
} from "./harness/notion-databases.ts";
import { fakeNotionPages } from "./harness/notion-pages.ts";
import { linkPage } from "./harness/notion-pull.ts";
import {
  SETUP_TIME,
  cronAt,
  loginForSync,
  richTextValue,
  titlePropertyId,
  titleValue,
  trackerPropertyId,
} from "./harness/notion-sync.ts";
import { fakeNotionWorkspace, type FakeNotionWorkspace } from "./harness/notion-workspace.ts";
import {
  expectConnected,
  expectConnection,
  fakeNotion,
  getNotionConnection,
  onlyCall,
  type FakeNotion,
} from "./harness/notion.ts";
import { MISSING_ID, type SessionOpts } from "./harness/rest.ts";
import { loginAs } from "./harness/session.ts";
import { startTimer, stopTimer } from "./harness/timers.ts";

type BrokenTemplate = [string, () => string];

const TEMPLATE_FIELDS: TrackerField[] = ["spentHours", "running", "lastTracked", "project"];

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
  opts: SessionOpts = {},
): Promise<TestResponse> {
  const requestOpts = { ...opts, as: session };
  const attempt = await notion.start(requestOpts);
  return notion.callback(attempt, requestOpts, { duplicatedTemplateId });
}

describe("автонастройка из шаблона", () => {
  it("16. callback с duplicated_template_id добавляет первую базу шаблона с own, start и timeProperties = true", async () => {
    const { session } = await loginAs({ locale: "ru" });
    const tasks = workspace.dataSource({
      title: ["Задачи"],
      properties: trackerFieldSpecs("ru", ALL_TRACKER_FIELDS),
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
          timeProperties: true,
        },
      ],
    });
  });

  it("7. базе шаблона добавляются числовое время, таймер, дата и проект", async () => {
    const { session } = await loginAs({ locale: "ru" });
    const tasks = workspace.dataSource({ title: ["Задачи"] });
    await connectWithTemplate(session, workspace.templatePage(tasks));

    expectAddedFields(onlyCall(workspace.schemaUpdates(tasks)), "ru", TEMPLATE_FIELDS);
  });

  it("7. база из шаблона заполняет три стандартных поля времени и позволяет изменить выбор", async () => {
    const session = await loginForSync();
    const source = workspace.dataSource({
      title: ["Задачи"],
      properties: trackerFieldSpecs("ru", ["spent"]),
    });
    expectConnected(await connectWithTemplate(session, workspace.templatePage(source), SETUP_TIME));
    const pages = fakeNotionPages(workspace);
    fakeNotionBlocks(pages);
    const page = pages.create(source.id);
    page.values.set(titlePropertyId(source), titleValue("Anki"));
    const spent = trackerPropertyId(source, "spent");
    const originalText = richTextValue("Моё значение");
    page.values.set(spent, originalText);
    const task = await linkPage(session, page.id, {}, SETUP_TIME);
    const [database] = await connectedDatabases(session, SETUP_TIME);
    if (!database) throw new Error("База из шаблона не подключена");
    const spentHours = trackerPropertyId(source, "spentHours");
    const runningField = trackerPropertyId(source, "running");
    const lastTracked = trackerPropertyId(source, "lastTracked");
    expect(database.timeFields).toEqual({ spentHours, running: runningField, lastTracked });

    const running = await startTimer(session, task.id, atMinute(1));
    await cronAt(atMinute(31));

    expect(Object.fromEntries(page.values)).toMatchObject({
      [spentHours]: { number: 0.5 },
      [spent]: originalText,
      [runningField]: { checkbox: true },
      [lastTracked]: { date: { start: running.startedAt } },
    });

    const changed = await updateDatabase(
      session,
      database.id,
      {
        timeFields: { spentHours: { mode: "existing", propertyId: spentHours } },
      },
      atMinute(32),
    );
    expect(changed.timeFields).toEqual({ spentHours });
    await stopTimer(session, task.id, atMinute(46));
    await cronAt(atMinute(46));

    expect(Object.fromEntries(page.values)).toMatchObject({
      [spentHours]: { number: 0.75 },
      [spent]: originalText,
      [runningField]: { checkbox: true },
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
