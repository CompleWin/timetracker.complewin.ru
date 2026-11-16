import { beforeEach, describe, expect, it } from "vitest";
import { answerNotionRevoke, deleteAccount } from "./harness/account.ts";
import { atMinute } from "./harness/clock.ts";
import { external } from "./harness/external.ts";
import { addSession } from "./harness/manual-sessions.ts";
import { fakeNotionBlocks } from "./harness/notion-blocks.ts";
import {
  EDIT_AFTER_IMPORT,
  IMPORT_RUN,
  LATER_RUN,
  NEXT_RUN,
  TASKS_BASE,
  pageIn,
  taskOfPage,
} from "./harness/notion-import.ts";
import { failureResponse, notionFailures } from "./harness/notion-pages.ts";
import {
  fakeNotionPull,
  linkPage,
  searchPages,
  userWithDatabase,
  type FakeNotionPull,
} from "./harness/notion-pull.ts";
import { cronAt, readTask, syncStatus } from "./harness/notion-sync.ts";
import {
  OK_REPLY,
  colleagueWithBase,
  eventAbout,
  fakePageReads,
  sendEvent,
} from "./harness/notion-webhooks.ts";
import { NOTION_V1 } from "./harness/notion-workspace.ts";
import { tablesContaining } from "./harness/storage.ts";
import { createTask, deleteTask, expectTaskTitles, listTasks } from "./harness/tasks.ts";

const DELETED_AT = atMinute(12);
const LINKED_AGAIN_AT = atMinute(21);
const TITLE = "Anki";
const RENAMED = "Anki: испанский";

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
  fakePageReads(fake.pages);
});

async function importedTask(database = TASKS_BASE) {
  const user = await userWithDatabase(fake, database);
  const page = pageIn(fake, user.added, TITLE);
  await cronAt(IMPORT_RUN);
  return { ...user, page, task: await taskOfPage(user.session, page, IMPORT_RUN) };
}

describe("удаление задачи со страницей Notion", () => {
  it("7. убирает задачу из очереди и оставляет страницу и журнал сессий как есть", async () => {
    const blocks = fakeNotionBlocks(fake.pages);
    const { session, task, page } = await importedTask({ ...TASKS_BASE, blockPosition: "start" });
    const firstSession = { startedAt: atMinute(11).now, endedAt: atMinute(12).now };
    await addSession(session, task.id, firstSession, atMinute(13));
    await cronAt(atMinute(14));
    expect(blocks.calloutsOn(page)).toHaveLength(1);
    expect(await syncStatus(session, atMinute(14))).toMatchObject({ pendingTasks: 0 });

    const secondSession = { startedAt: atMinute(15).now, endedAt: atMinute(16).now };
    await addSession(session, task.id, secondSession, atMinute(17));
    expect(await syncStatus(session, atMinute(17))).toMatchObject({ pendingTasks: 1 });

    const calls = await fake.requestsExceptPullDuring(async () => {
      await deleteTask(session, task.id, atMinute(18));
      expect(await syncStatus(session, atMinute(18))).toMatchObject({ pendingTasks: 0 });
      await cronAt(NEXT_RUN);
    });

    expect(calls).toEqual([]);
  });

  it("не повторяет запрос записи в Notion после удаления задачи во время cron", async () => {
    const { session, task, page } = await importedTask();
    const times = { startedAt: atMinute(11).now, endedAt: atMinute(12).now };
    await addSession(session, task.id, times, atMinute(13));
    let firstPatch = true;
    external.on("PATCH", `${NOTION_V1}/pages/${page.id}`, async () => {
      if (firstPatch) {
        firstPatch = false;
        await deleteTask(session, task.id, atMinute(15));
      }
      return failureResponse(notionFailures.unauthorized);
    });

    await cronAt(atMinute(14));

    expect(fake.notion.refreshRequests()).toHaveLength(1);
    expect(fake.pages.updates(page)).toHaveLength(1);
    expectTaskTitles(await listTasks(session, { archived: "all" }, NEXT_RUN), []);
  });

  it("8. pull не импортирует изменённую страницу после удаления её задачи", async () => {
    const { session, task, page } = await importedTask();
    await deleteTask(session, task.id, DELETED_AT);
    fake.editInNotion(page, { title: RENAMED, editedAt: EDIT_AFTER_IMPORT });

    expect(await fake.queriesDuring(() => cronAt(NEXT_RUN))).toHaveLength(1);
    expectTaskTitles(await listTasks(session, { archived: "all" }, NEXT_RUN), []);
  });

  it("9. подписанное событие о странице не возвращает удалённую задачу", async () => {
    const { session, task, page, added } = await importedTask();
    await deleteTask(session, task.id, DELETED_AT);
    fake.editInNotion(page, { title: RENAMED, editedAt: EDIT_AFTER_IMPORT });

    expect(await sendEvent(eventAbout(page, added.dataSource), NEXT_RUN)).toMatchObject(OK_REPLY);
    expectTaskTitles(await listTasks(session, { archived: "all" }, NEXT_RUN), []);
  });

  it("9. вебхук не связывает страницу с одноимённой задачей, созданной на сайте", async () => {
    const { session, task, page, added } = await importedTask();
    await deleteTask(session, task.id, DELETED_AT);
    const siteTask = await createTask(
      session,
      { title: TITLE, projectId: task.projectId },
      DELETED_AT,
    );
    fake.editInNotion(page, { editedAt: EDIT_AFTER_IMPORT });

    expect(await sendEvent(eventAbout(page, added.dataSource), NEXT_RUN)).toMatchObject(OK_REPLY);
    expectTaskTitles(await listTasks(session, { archived: "all" }, NEXT_RUN), [TITLE]);
    expect(await readTask(session, siteTask.id, NEXT_RUN)).toMatchObject({ notionPageUrl: null });
  });

  it("9. удаление у одного пользователя не мешает импорту той же страницы другим", async () => {
    const { session, task, page, added } = await importedTask();
    await deleteTask(session, task.id, DELETED_AT);
    const colleague = await colleagueWithBase(fake, added.dataSource);
    fake.editInNotion(page, { editedAt: EDIT_AFTER_IMPORT });

    expect(await sendEvent(eventAbout(page, added.dataSource), NEXT_RUN)).toMatchObject(OK_REPLY);
    expectTaskTitles(await listTasks(session, { archived: "all" }, NEXT_RUN), []);
    expect(await taskOfPage(colleague.session, page, NEXT_RUN)).toMatchObject({ title: TITLE });
  });

  it("10 и 11. поиск показывает страницу без связи, после явного добавления pull обновляет новую задачу", async () => {
    const { session, task, page, added } = await importedTask();
    await deleteTask(session, task.id, DELETED_AT);

    expect(
      await searchPages(session, { databaseId: added.database.id, q: TITLE }, NEXT_RUN),
    ).toMatchObject({
      status: 200,
      body: { pages: [{ pageId: page.id, title: TITLE, linkedTaskId: null }] },
    });
    const linked = await linkPage(session, page.id, {}, LINKED_AGAIN_AT);
    expect(linked).toMatchObject({ notionPageUrl: page.url, title: TITLE });
    expect(linked.id).not.toBe(task.id);
    expect(await tablesContaining(page.id.replaceAll("-", ""))).not.toContain(
      "deleted_notion_pages",
    );

    fake.editInNotion(page, { title: RENAMED, editedAt: atMinute(25) });
    expect(await fake.queriesDuring(() => cronAt(LATER_RUN))).toHaveLength(1);
    expectTaskTitles(await listTasks(session, { archived: "all" }, LATER_RUN), [RENAMED]);
    expect(await readTask(session, linked.id, LATER_RUN)).toMatchObject({ title: RENAMED });
  });

  it("удаление аккаунта стирает список удалённых страниц", async () => {
    const { session, task, page } = await importedTask();
    await deleteTask(session, task.id, DELETED_AT);
    const pageId = page.id.replaceAll("-", "");
    expect(await tablesContaining(pageId)).toEqual(["deleted_notion_pages"]);

    answerNotionRevoke();
    expect(await deleteAccount(session, NEXT_RUN)).toMatchObject({ status: 204 });

    expect(await tablesContaining(pageId)).toEqual([]);
  });
});
