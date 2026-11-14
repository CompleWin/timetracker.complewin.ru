import { beforeEach, describe, expect, it } from "vitest";
import { atMinute, atSecond } from "./harness/clock.ts";
import { addSession } from "./harness/manual-sessions.ts";
import {
  DONE,
  TASKS_BASE,
  TASKS_BASE_WITH_STATUS,
  TASKS_TITLE,
  activeTasks,
  pageIn,
  projectOfPage,
  taskOfPage,
  withStatus,
} from "./harness/notion-import.ts";
import { notionFailures, type FakePage, type PageValue } from "./harness/notion-pages.ts";
import {
  fakeNotionPull,
  optionsProperty,
  projectOfTask,
  selectValue,
  type FakeNotionPull,
  type NotionOption,
} from "./harness/notion-pull.ts";
import {
  FUN_DATABASE,
  SETUP_TIME,
  TASKS_DATABASE,
  TASK_TITLE,
  cronAt,
  loginForSync,
  propertyNamed,
  readTask,
  syncStatus,
  type DatabaseSetup,
  type SyncedTask,
} from "./harness/notion-sync.ts";
import { connectWithLinkedTask, linkedTask } from "./harness/notion-task-pages.ts";
import type { FakeDataSource } from "./harness/notion-workspace.ts";
import { expectConnection, getNotionConnection, onlyCall } from "./harness/notion.ts";
import {
  eventAbout,
  fakePageReads,
  isPageRead,
  sendEvent,
  webhookTaskUser,
  webhookUser,
  type FakePageReads,
  type PageEventInput,
  type WebhookTaskUser,
  type WebhookUser,
} from "./harness/notion-webhooks.ts";
import { createProject, type TestProject } from "./harness/projects.ts";
import { createTask, updateTask, type TestTask } from "./harness/tasks.ts";
import { startTimer } from "./harness/timers.ts";

const EDITED_IN_NOTION = atMinute(1);
const EVENT_TIME = atMinute(2);
const EDITED_AGAIN = atMinute(3);
const NEXT_EVENT = atMinute(4);
const RENAMED_IN_NOTION = "Anki: испанский";
const RENAMED_IN_TRACKER = "Anki: трекер";
const AREA = "Сфера";
const SPORT: NotionOption = { name: "Спорт", color: "green" };
const BY_SELECT: DatabaseSetup = {
  ...TASKS_DATABASE,
  properties: [optionsProperty(AREA, "select", [SPORT])],
  projectProperty: AREA,
};
const RATE_LIMIT_RETRY_AFTER_SEC = 30;

type UserWithNewPage = WebhookUser & {
  page: FakePage;
};

type UserWithSiteTask = UserWithNewPage & {
  siteTask: TestTask;
};

type SportTask = WebhookTaskUser & {
  sport: TestProject;
  setArea(value: PageValue, editedAt: { now: string }): void;
};

let fake: FakeNotionPull;
let reads: FakePageReads;

beforeEach(() => {
  fake = fakeNotionPull();
  reads = fakePageReads(fake.pages);
});

function sendAboutTask(
  user: WebhookTaskUser,
  time: { now: string } = EVENT_TIME,
  input: PageEventInput = {},
): Promise<unknown> {
  return sendEvent(eventAbout(user.page, user.tasks.dataSource, input), time);
}

function sendAboutNewPage(
  { added, page }: UserWithNewPage,
  time: { now: string } = EVENT_TIME,
): Promise<unknown> {
  return sendEvent(eventAbout(page, added.dataSource, { type: "page.created" }), time);
}

async function userWithNewPage(
  database: DatabaseSetup = TASKS_BASE,
  title = "Anki",
  values: Record<string, PageValue> = {},
): Promise<UserWithNewPage> {
  const user = await webhookUser(fake, database);
  return { ...user, page: pageIn(fake, user.added, title, values, EDITED_IN_NOTION) };
}

async function siteTaskBesideNewPage(): Promise<UserWithSiteTask> {
  const user = await webhookUser(fake, TASKS_BASE);
  const project = await createProject(user.session, { name: TASKS_TITLE }, SETUP_TIME);
  const siteTask = await createTask(
    user.session,
    { title: TASK_TITLE, projectId: project.id },
    SETUP_TIME,
  );
  const page = pageIn(fake, user.added, TASK_TITLE, {}, EDITED_IN_NOTION);
  return { ...user, page, siteTask };
}

function recordSession({ session }: WebhookUser, task: TestTask): Promise<unknown> {
  return addSession(
    session,
    task.id,
    { startedAt: SETUP_TIME.now, endedAt: EDITED_IN_NOTION.now },
    EDITED_IN_NOTION,
  );
}

async function renamedInNotion(): Promise<WebhookTaskUser> {
  const user = await webhookTaskUser(fake);
  fake.editInNotion(user.page, { title: RENAMED_IN_NOTION, editedAt: EDITED_IN_NOTION });
  return user;
}

async function sportTask(): Promise<SportTask> {
  const session = await loginForSync();
  const sport = await createProject(session, SPORT, SETUP_TIME);
  const user = await connectWithLinkedTask(fake, session, BY_SELECT);
  await cronAt(SETUP_TIME);
  const areaId = propertyNamed(user.tasks.dataSource, AREA).id;
  return {
    ...user,
    grant: fake.notion.latestGrant(),
    sport,
    setArea: (value, editedAt) =>
      fake.editInNotion(user.page, { values: { [areaId]: value }, editedAt }),
  };
}

function moveInNotion(page: FakePage, dataSource: FakeDataSource): void {
  page.dataSourceId = dataSource.id;
}

async function linkedTasksOf(user: UserWithNewPage, time: { now: string }): Promise<SyncedTask[]> {
  return (await activeTasks(user.session, time)).filter(
    (task) => task.notionPageUrl === user.page.url,
  );
}

describe("связанная страница", () => {
  it("13. страницу переименовали в Notion: после события у задачи новое название", async () => {
    const user = await renamedInNotion();
    await sendAboutTask(user);

    expect(await readTask(user.session, user.task.id, EVENT_TIME)).toMatchObject({
      title: RENAMED_IN_NOTION,
    });
  });

  it("13. название сменили в трекере позже правки в Notion: остаётся название трекера", async () => {
    const user = await renamedInNotion();
    await updateTask(user.session, user.task.id, { title: RENAMED_IN_TRACKER }, EVENT_TIME);
    await sendAboutTask(user, NEXT_EVENT);

    expect(await readTask(user.session, user.task.id, NEXT_EVENT)).toMatchObject({
      title: RENAMED_IN_TRACKER,
    });
  });

  it("13. в поле проекта поставили «Спорт»: после события задача в проекте «Спорт»", async () => {
    const user = await sportTask();
    user.setArea(selectValue(SPORT), EDITED_IN_NOTION);
    await sendAboutTask(user);

    expect(await projectOfTask(user.session, user.task.id, EVENT_TIME)).toMatchObject({
      id: user.sport.id,
    });
  });

  it("13. поле проекта очистили: после события задача возвращается в проект по умолчанию базы", async () => {
    const user = await sportTask();
    const defaultProject = await projectOfTask(user.session, user.task.id, SETUP_TIME);
    user.setArea(selectValue(SPORT), EDITED_IN_NOTION);
    await sendAboutTask(user);
    user.setArea(selectValue(null), EDITED_AGAIN);
    await sendAboutTask(user, NEXT_EVENT);

    expect(defaultProject).not.toBeNull();
    expect(await projectOfTask(user.session, user.task.id, NEXT_EVENT)).toMatchObject({
      id: defaultProject?.id,
    });
  });
});

describe("новая запись", () => {
  it("14. новая запись в добавленной базе: событие создаёт задачу с её названием в проекте по умолчанию базы", async () => {
    const user = await userWithNewPage();
    await sendAboutNewPage(user);

    expect(await taskOfPage(user.session, user.page, EVENT_TIME)).toMatchObject({ title: "Anki" });
    expect(await projectOfPage(user.session, user.page, EVENT_TIME)).toMatchObject({
      name: TASKS_TITLE,
    });
  });

  it("14. запись со статусом, который пользователь пропускает: задача не создаётся", async () => {
    const user = await webhookUser(fake, TASKS_BASE_WITH_STATUS);
    const values = withStatus(user.added.dataSource, DONE);
    const page = pageIn(fake, user.added, "Anki", values, EDITED_IN_NOTION);
    await sendAboutNewPage({ ...user, page });

    expect(await activeTasks(user.session, EVENT_TIME)).toEqual([]);
  });

  it("14. запись с пустым названием: задача не создаётся", async () => {
    const user = await userWithNewPage(TASKS_BASE, "");
    await sendAboutNewPage(user);

    expect(await activeTasks(user.session, EVENT_TIME)).toEqual([]);
  });

  it("14. задача с сайта с тем же названием в том же проекте связывается со страницей, новая не создаётся", async () => {
    const user = await webhookUser(fake, TASKS_BASE);
    const report = pageIn(fake, user.added, "Отчёт", {}, EDITED_IN_NOTION);
    await sendAboutNewPage({ ...user, page: report });
    const project = await projectOfPage(user.session, report, EVENT_TIME);
    const siteTask = await createTask(
      user.session,
      { title: "Anki", projectId: project?.id ?? null },
      EVENT_TIME,
    );
    const page = pageIn(fake, user.added, "Anki", {}, EDITED_AGAIN);
    await sendAboutNewPage({ ...user, page }, NEXT_EVENT);

    expect(project).not.toBeNull();
    expect(await activeTasks(user.session, NEXT_EVENT)).toHaveLength(2);
    expect(await readTask(user.session, siteTask.id, NEXT_EVENT)).toMatchObject({
      notionPageUrl: page.url,
    });
  });

  it("14. по ответу GET страница лежит в базе, которую пользователь не добавил: задача не создаётся", async () => {
    const user = await userWithNewPage();
    moveInNotion(user.page, fake.workspace.dataSource({ title: ["Чужая"] }));
    await sendAboutNewPage(user);

    expect(await activeTasks(user.session, EVENT_TIME)).toEqual([]);
  });
});

describe("страница удалена", () => {
  async function runningTaskPage(): Promise<WebhookTaskUser> {
    const user = await webhookTaskUser(fake);
    await startTimer(user.session, user.task.id, EDITED_IN_NOTION);
    return user;
  }

  async function expectUnlinkedAndArchived(user: WebhookTaskUser): Promise<void> {
    expect(await readTask(user.session, user.task.id, EVENT_TIME)).toMatchObject({
      notionPageUrl: null,
      notionDatabaseId: null,
      archived: true,
      runningSessionId: null,
    });
  }

  it("15. связанная страница в корзине: связь сброшена, задача в архиве, таймер остановлен", async () => {
    const user = await runningTaskPage();
    fake.pages.trash(user.page);
    await sendAboutTask(user, EVENT_TIME, { type: "page.deleted" });

    await expectUnlinkedAndArchived(user);
  });

  it("15. GET связанной страницы ответил 404: связь сброшена, задача в архиве, таймер остановлен", async () => {
    const user = await runningTaskPage();
    fake.pages.remove(user.page);
    await sendAboutTask(user, EVENT_TIME, { type: "page.deleted" });

    await expectUnlinkedAndArchived(user);
  });

  it("15. несвязанная страница в корзине: задача не создаётся", async () => {
    const user = await userWithNewPage();
    fake.pages.trash(user.page);
    await sendEvent(
      eventAbout(user.page, user.added.dataSource, { type: "page.deleted" }),
      EVENT_TIME,
    );

    expect(await activeTasks(user.session, EVENT_TIME)).toEqual([]);
  });
});

describe("страница перенесена", () => {
  it("16. связанную страницу перенесли в другую добавленную базу и переименовали: задача не меняется, вторая не создаётся", async () => {
    const session = await loginForSync();
    const { tasks, fun } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
    });
    const { task, page } = await linkedTask(fake, session, tasks, { title: TASK_TITLE });
    moveInNotion(page, fun.dataSource);
    fake.editInNotion(page, { title: RENAMED_IN_NOTION, editedAt: EDITED_IN_NOTION });
    await sendEvent(eventAbout(page, fun.dataSource, { type: "page.moved" }), EVENT_TIME);

    expect(await readTask(session, task.id, EVENT_TIME)).toMatchObject({
      title: TASK_TITLE,
      archived: false,
      notionPageUrl: page.url,
      notionDatabaseId: task.notionDatabaseId,
      projectId: task.projectId,
    });
    expect(await activeTasks(session, EVENT_TIME)).toHaveLength(1);
  });
});

describe("одна страница, одна задача", () => {
  it("17. повторное событие о той же записи не создаёт вторую задачу", async () => {
    const user = await userWithNewPage();
    await sendAboutNewPage(user);
    await sendAboutNewPage(user, NEXT_EVENT);

    expect(await linkedTasksOf(user, NEXT_EVENT)).toHaveLength(1);
  });

  it("17. два одновременных события об одной записи дают одну задачу", async () => {
    const user = await userWithNewPage();
    await Promise.all([sendAboutNewPage(user), sendAboutNewPage(user)]);

    expect(await linkedTasksOf(user, EVENT_TIME)).toHaveLength(1);
  });

  it("17. событие одновременно с pull дают одну задачу", async () => {
    const user = await userWithNewPage();
    await Promise.all([sendAboutNewPage(user), cronAt(EVENT_TIME)]);

    expect(await linkedTasksOf(user, EVENT_TIME)).toHaveLength(1);
  });
});

describe("ошибки Notion при чтении страницы", () => {
  it("18. 401 на GET: трекер один раз обновляет токен, подключение остаётся ok", async () => {
    const user = await renamedInNotion();
    reads.fail(notionFailures.unauthorized);
    await sendAboutTask(user);

    expect(fake.notion.refreshRequests()).toHaveLength(1);
    expectConnection(await getNotionConnection(user.session, EVENT_TIME), { status: "ok" });
  });

  it("18. 401 на GET и неудачное обновление токена: подключение needs_reauth", async () => {
    const user = await renamedInNotion();
    fake.notion.rejectRefresh();
    reads.fail(notionFailures.unauthorized);
    await sendAboutTask(user);

    expectConnection(await getNotionConnection(user.session, EVENT_TIME), {
      status: "needs_reauth",
    });
  });

  it("18. 429 с Retry-After: 30: следующие 30 секунд события не читают страницу, потом читают снова", async () => {
    const user = await renamedInNotion();
    reads.fail(notionFailures.rateLimited(RATE_LIMIT_RETRY_AFTER_SEC));
    await sendAboutTask(user, atSecond(120));
    const duringPause = await fake.requestsDuring(() => sendAboutTask(user, atSecond(149)));
    const afterPause = await fake.requestsDuring(() => sendAboutTask(user, atSecond(151)));

    expect(duringPause).toEqual([]);
    expect(afterPause.filter(isPageRead)).toHaveLength(1);
  });

  it("18. 500 на GET: задача и подключение не меняются", async () => {
    const user = await renamedInNotion();
    reads.fail(notionFailures.serverError);
    await sendAboutTask(user);

    expect(await readTask(user.session, user.task.id, EVENT_TIME)).toMatchObject({
      title: TASK_TITLE,
      archived: false,
      notionPageUrl: user.page.url,
    });
    expectConnection(await getNotionConnection(user.session, EVENT_TIME), { status: "ok" });
  });

  it("18. событие, обновившее задачу, не ставит её в очередь push: pendingTasks 0, cron не отправляет PATCH страницы", async () => {
    const user = await renamedInNotion();
    await sendAboutTask(user);

    expect(await syncStatus(user.session, EVENT_TIME)).toMatchObject({ pendingTasks: 0 });
    expect(await fake.updatesDuring(user.page, () => cronAt(NEXT_EVENT))).toEqual([]);
  });

  it("18. задача, созданная событием, не попадает в очередь push", async () => {
    const user = await userWithNewPage();
    await sendAboutNewPage(user);

    expect(await syncStatus(user.session, EVENT_TIME)).toMatchObject({ pendingTasks: 0 });
    expect(await fake.updatesDuring(user.page, () => cronAt(NEXT_EVENT))).toEqual([]);
  });

  it("18. задача с сайта без сессий, которую событие связало со страницей, не попадает в очередь push", async () => {
    const user = await siteTaskBesideNewPage();
    await sendAboutNewPage(user);

    expect(await readTask(user.session, user.siteTask.id, EVENT_TIME)).toMatchObject({
      notionPageUrl: user.page.url,
    });
    expect(await syncStatus(user.session, EVENT_TIME)).toMatchObject({ pendingTasks: 0 });
    expect(await fake.updatesDuring(user.page, () => cronAt(NEXT_EVENT))).toEqual([]);
  });

  it("18. задача с сайта с сессией, которую событие связало со страницей, встаёт в очередь push, и ближайший cron отправляет PATCH страницы", async () => {
    const user = await siteTaskBesideNewPage();
    await recordSession(user, user.siteTask);
    await sendAboutNewPage(user);

    expect(await readTask(user.session, user.siteTask.id, EVENT_TIME)).toMatchObject({
      notionPageUrl: user.page.url,
    });
    expect(await syncStatus(user.session, EVENT_TIME)).toMatchObject({ pendingTasks: 1 });
    onlyCall(await fake.updatesDuring(user.page, () => cronAt(NEXT_EVENT)));
  });
});
