import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCall } from "./harness/index.ts";
import { atMinute, atSecond } from "./harness/clock.ts";
import { TASKS_BASE, activeTasks, pageIn, taskOfPage } from "./harness/notion-import.ts";
import { notionFailures, type FakePage } from "./harness/notion-pages.ts";
import { fakeNotionPull, type FakeNotionPull } from "./harness/notion-pull.ts";
import { cronAt, readTask, type SyncedDatabase } from "./harness/notion-sync.ts";
import { NOTION_V1, type FakeDataSource } from "./harness/notion-workspace.ts";
import {
  checkNotionConnection,
  expectConnection,
  onlyCall,
  otherNotionWorkspace,
} from "./harness/notion.ts";
import {
  OK_REPLY,
  PERSON,
  bearerOf,
  botOf,
  colleagueWithBase,
  compactUpperId,
  dataSourceParent,
  databaseParent,
  eventAbout,
  fakePageReads,
  isPageRead,
  pageEvent,
  queriesPerCron,
  sendEvent,
  unrelatedEvent,
  webhookTaskUser,
  webhookUser,
  type NotionWebhookEvent,
  type PageEventInput,
  type WebhookTaskUser,
  type WebhookUser,
} from "./harness/notion-webhooks.ts";
import { updateTask } from "./harness/tasks.ts";

const EDITED_IN_NOTION = atMinute(1);
const EVENT_TIME = atMinute(2);
const RENAMED = "Anki: испанский";
const RATE_LIMIT_RETRY_AFTER_SEC = 30;
const PAUSED_AT = atMinute(1);
const DURING_PAUSE = atSecond(70);
const AFTER_PAUSE = atSecond(60 + RATE_LIMIT_RETRY_AFTER_SEC + 1);
const THIRTY_MINUTE_PULL = [0, 0, 1];
const FIVE_MINUTE_PULL = [1, 1, 0];
const PULL_CHECKS = [5, 29, 30];
const TWO_DAYS_EARLIER = "2029-12-30T00:00:00.000Z";

type Colleagues = {
  first: WebhookUser;
  second: WebhookUser;
  page: FakePage;
};

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
  fakePageReads(fake.pages);
});

function eventAboutTask(user: WebhookTaskUser, input: PageEventInput = {}): NotionWebhookEvent {
  return eventAbout(user.page, user.tasks.dataSource, input);
}

function requestsDuringEvent(event: unknown, time = EVENT_TIME): Promise<ExternalCall[]> {
  return fake.requestsDuring(() => sendEvent(event, time));
}

async function readsDuringEvent(event: unknown, time = EVENT_TIME): Promise<ExternalCall[]> {
  return (await requestsDuringEvent(event, time)).filter(isPageRead);
}

function newPageIn({ dataSource }: SyncedDatabase): FakePage {
  return fake.pageInNotion(dataSource, { title: "Anki", editedAt: EDITED_IN_NOTION });
}

async function renamedTaskPage(): Promise<WebhookTaskUser> {
  const user = await webhookTaskUser(fake);
  fake.editInNotion(user.page, { title: RENAMED, editedAt: EDITED_IN_NOTION });
  return user;
}

async function pausedTaskPage(): Promise<WebhookTaskUser> {
  const user = await webhookTaskUser(fake);
  await updateTask(user.session, user.task.id, { title: "Anki: трекер" }, PAUSED_AT);
  fake.pages.failWrites(notionFailures.rateLimited(RATE_LIMIT_RETRY_AFTER_SEC));
  await cronAt(PAUSED_AT);
  return user;
}

async function colleaguesSharingBase(): Promise<Colleagues> {
  const first = await webhookUser(fake, TASKS_BASE);
  const second = await colleagueWithBase(fake, first.added.dataSource);
  return { first, second, page: newPageIn(first.added) };
}

async function colleaguesWithOwnBases(): Promise<{ first: WebhookTaskUser; second: WebhookUser }> {
  const first = await webhookTaskUser(fake);
  const second = await colleagueWithBase(fake, fake.workspace.dataSource({ title: ["Личное"] }));
  return { first, second };
}

function tokensOf(calls: ExternalCall[]): string[] {
  return calls.map(bearerOf).toSorted();
}

function bearer(user: WebhookUser | WebhookTaskUser): string {
  return `Bearer ${user.grant.accessToken}`;
}

function sharedBaseEvent(
  { first, page }: Colleagues,
  input: PageEventInput = {},
): NotionWebhookEvent {
  return eventAbout(page, first.added.dataSource, { type: "page.created", ...input });
}

function foreignDataSource(): FakeDataSource {
  return fake.workspace.dataSource({ title: ["Чужая"] });
}

describe("получатели события", () => {
  it("7. событие из другого workspace: 200 { ok: true }, запросов к Notion нет", async () => {
    const user = await renamedTaskPage();
    const event = eventAboutTask(user, { workspaceId: otherNotionWorkspace.id });
    const requests = await fake.requestsDuring(async () => {
      expect(await sendEvent(event, EVENT_TIME)).toMatchObject(OK_REPLY);
    });

    expect(requests).toEqual([]);
  });

  it("7. подключение needs_reauth событие не получает: запросов к Notion нет", async () => {
    const user = await renamedTaskPage();
    fake.notion.expireAccessTokens();
    fake.notion.rejectRefresh();
    expectConnection(await checkNotionConnection(user.session, EDITED_IN_NOTION), {
      status: "needs_reauth",
    });

    expect(await requestsDuringEvent(eventAboutTask(user))).toEqual([]);
  });

  it("7. в accessible_by нет бота подключения: запросов к Notion нет", async () => {
    const user = await renamedTaskPage();
    const otherBot = { id: crypto.randomUUID(), type: "bot" };

    expect(await requestsDuringEvent(eventAboutTask(user, { accessibleBy: [otherBot] }))).toEqual(
      [],
    );
  });

  it("7. в accessible_by есть бот подключения: страница читается", async () => {
    const user = await renamedTaskPage();
    const event = eventAboutTask(user, { accessibleBy: [PERSON, botOf(user.grant)] });

    expect(await readsDuringEvent(event)).toHaveLength(1);
  });

  it("7. два подключения к одному workspace с общей базой: каждое читает страницу своим токеном и получает задачу", async () => {
    const colleagues = await colleaguesSharingBase();
    const { first, second, page } = colleagues;
    const reads = await readsDuringEvent(sharedBaseEvent(colleagues));

    expect(tokensOf(reads)).toEqual([bearer(first), bearer(second)].toSorted());
    expect(await taskOfPage(first.session, page, EVENT_TIME)).toMatchObject({ title: "Anki" });
    expect(await taskOfPage(second.session, page, EVENT_TIME)).toMatchObject({ title: "Anki" });
  });

  it("7. в accessible_by только бот второго подключения: страницу читает только оно, у первого задачи нет", async () => {
    const colleagues = await colleaguesSharingBase();
    const { first, second } = colleagues;
    const event = sharedBaseEvent(colleagues, { accessibleBy: [botOf(second.grant)] });
    const reads = await readsDuringEvent(event);

    expect(tokensOf(reads)).toEqual([bearer(second)]);
    expect(await activeTasks(first.session, EVENT_TIME)).toEqual([]);
  });
});

describe("последнее событие вебхука", () => {
  async function afterFirstPull(): Promise<WebhookUser> {
    const user = await webhookUser(fake);
    await cronAt(atMinute(0));
    return user;
  }

  it("8. событие от push самого трекера всё равно переводит pull на раз в 30 минут", async () => {
    const user = await webhookTaskUser(fake);
    await sendEvent(eventAboutTask(user, { authors: [botOf(user.grant)] }), atMinute(1));

    expect(await queriesPerCron(fake, PULL_CHECKS)).toEqual(THIRTY_MINUTE_PULL);
  });

  it("8. событие во время паузы после 429 всё равно переводит pull на раз в 30 минут", async () => {
    const user = await pausedTaskPage();
    await sendEvent(eventAboutTask(user), DURING_PAUSE);

    expect(await queriesPerCron(fake, PULL_CHECKS)).toEqual(THIRTY_MINUTE_PULL);
  });

  it("8. событие о странице, которая пользователю не интересна, всё равно переводит pull на раз в 30 минут", async () => {
    await afterFirstPull();
    await sendEvent(unrelatedEvent(), atMinute(1));

    expect(await queriesPerCron(fake, PULL_CHECKS)).toEqual(THIRTY_MINUTE_PULL);
  });

  it("8. время события берётся по часам сервера, а не из timestamp: событие с timestamp двухдневной давности переводит pull на раз в 30 минут", async () => {
    await afterFirstPull();
    await sendEvent(unrelatedEvent({ timestamp: TWO_DAYS_EARLIER }), atMinute(1));

    expect(await queriesPerCron(fake, PULL_CHECKS)).toEqual(THIRTY_MINUTE_PULL);
  });

  it("8. подключение, которое не получило событие, читает базу раз в 5 минут", async () => {
    await afterFirstPull();
    await sendEvent(unrelatedEvent({ workspaceId: otherNotionWorkspace.id }), atMinute(1));

    expect(await queriesPerCron(fake, PULL_CHECKS)).toEqual(FIVE_MINUTE_PULL);
  });
});

describe("события от самого трекера", () => {
  it("9. все authors это бот подключения: запросов к Notion нет, название задачи не меняется", async () => {
    const user = await renamedTaskPage();
    const event = eventAboutTask(user, { authors: [botOf(user.grant)] });

    expect(await requestsDuringEvent(event)).toEqual([]);
    expect(await readTask(user.session, user.task.id, EVENT_TIME)).toMatchObject({
      title: user.task.title,
    });
  });

  it("9. среди authors кроме бота подключения есть человек: страница читается", async () => {
    const user = await renamedTaskPage();
    const event = eventAboutTask(user, { authors: [botOf(user.grant), PERSON] });

    expect(await readsDuringEvent(event)).toHaveLength(1);
  });

  it("9. author это другой бот: страница читается", async () => {
    const user = await renamedTaskPage();
    const event = eventAboutTask(user, { authors: [{ id: crypto.randomUUID(), type: "bot" }] });

    expect(await readsDuringEvent(event)).toHaveLength(1);
  });
});

describe("пауза синка", () => {
  it("10. синк на паузе после 429: событие не отправляет запросов к Notion", async () => {
    const user = await pausedTaskPage();

    expect(await requestsDuringEvent(eventAboutTask(user), DURING_PAUSE)).toEqual([]);
  });

  it("10. пауза закончилась: событие снова читает страницу", async () => {
    const user = await pausedTaskPage();

    expect(await readsDuringEvent(eventAboutTask(user), AFTER_PAUSE)).toHaveLength(1);
  });
});

describe("интересные страницы", () => {
  it("11. связанная страница читается, даже если parent события не база пользователя", async () => {
    const user = await webhookTaskUser(fake);
    const event = pageEvent(user.page.id, { parent: databaseParent(foreignDataSource()) });

    expect(await readsDuringEvent(event)).toHaveLength(1);
  });

  it("11. entity.id связанной страницы без дефисов и в верхнем регистре: страница читается", async () => {
    const user = await webhookTaskUser(fake);
    const event = pageEvent(compactUpperId(user.page.id));

    expect(await readsDuringEvent(event)).toHaveLength(1);
  });

  it.each<[string, (dataSource: FakeDataSource) => { id: string; type: string }]>([
    ["databaseId", databaseParent],
    ["dataSourceId", dataSourceParent],
    [
      "databaseId без дефисов в верхнем регистре",
      (dataSource) => ({
        ...databaseParent(dataSource),
        id: compactUpperId(dataSource.databaseId),
      }),
    ],
    [
      "dataSourceId без дефисов в верхнем регистре",
      (dataSource) => ({ ...dataSourceParent(dataSource), id: compactUpperId(dataSource.id) }),
    ],
  ])(
    "11. несвязанная страница, data.parent.id совпадает с %s добавленной базы: страница читается",
    async (_case, parentOf) => {
      const { added } = await webhookUser(fake);
      const page = newPageIn(added);
      const event = pageEvent(page.id, {
        type: "page.created",
        parent: parentOf(added.dataSource),
      });

      expect(await readsDuringEvent(event)).toHaveLength(1);
    },
  );

  it("11. несвязанная страница в базе, которую пользователь не добавил: запросов к Notion нет", async () => {
    await webhookUser(fake);
    const elsewhere = foreignDataSource();
    const page = fake.pageInNotion(elsewhere, { title: "Anki", editedAt: EDITED_IN_NOTION });

    expect(await requestsDuringEvent(eventAbout(page, elsewhere))).toEqual([]);
  });

  it("11. страница связана с задачей другого пользователя того же workspace: её читает только он", async () => {
    const { first } = await colleaguesWithOwnBases();
    const reads = await readsDuringEvent(eventAboutTask(first));

    expect(tokensOf(reads)).toEqual([bearer(first)]);
  });
});

describe("чтение страницы", () => {
  it("12. интересная страница: ровно один запрос к Notion, GET /v1/pages/{entity.id} с токеном получателя", async () => {
    const user = await renamedTaskPage();
    const request = onlyCall(await requestsDuringEvent(eventAboutTask(user)));

    expect(request).toMatchObject({ method: "GET", url: `${NOTION_V1}/pages/${user.page.id}` });
    expect(bearerOf(request)).toBe(bearer(user));
  });

  it("12. новая запись в добавленной базе: ровно один GET страницы с токеном получателя", async () => {
    const user = await webhookUser(fake);
    const page = pageIn(fake, user.added, "Anki", {}, EDITED_IN_NOTION);
    const event = eventAbout(page, user.added.dataSource, { type: "page.created" });
    const request = onlyCall(await requestsDuringEvent(event));

    expect(request).toMatchObject({ method: "GET", url: `${NOTION_V1}/pages/${page.id}` });
    expect(bearerOf(request)).toBe(bearer(user));
  });
});
