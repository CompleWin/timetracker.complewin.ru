import { beforeEach, describe, expect, it } from "vitest";
import { addSession } from "./harness/manual-sessions.ts";
import { atMinute } from "./harness/clock.ts";
import { addDatabase, deleteDatabase, updateDatabase } from "./harness/notion-databases.ts";
import {
  DONE,
  EDIT_AFTER_IMPORT,
  IMPORT_RUN,
  IN_PROGRESS,
  LATER_RUN,
  NEXT_RUN,
  TASKS_BASE,
  TASKS_BASE_WITH_STATUS,
  TASKS_TITLE,
  activeTasks,
  filterOf,
  onlyProjectNamed,
  pageIn,
  statusFieldOf,
  statusIds,
  taskOfPage,
  withStatus,
  withoutStatus,
} from "./harness/notion-import.ts";
import type { FakePage } from "./harness/notion-pages.ts";
import {
  cursorOf,
  fakeNotionPull,
  userWithDatabase,
  type FakeNotionPull,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import { cronAt, readTask, syncStatus, type SyncedTask } from "./harness/notion-sync.ts";
import { onlyCall } from "./harness/notion.ts";
import { createProject } from "./harness/projects.ts";
import { archiveTask, updateTask } from "./harness/tasks.ts";

const REMOVED_AT = atMinute(12);
const ADDED_AGAIN_AT = atMinute(13);
const NEW_STATUS_ID = "7f1c2a58-0d4b-4f6e-9a3c-5b2e8d1f6c70";

type ImportedTask = UserWithDatabase & {
  page: FakePage;
  task: SyncedTask;
};

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

function userWithStatuses(): Promise<UserWithDatabase> {
  return userWithDatabase(fake, TASKS_BASE_WITH_STATUS);
}

function pageWithStatus({ added }: UserWithDatabase, status: string, title = "Anki"): FakePage {
  return pageIn(fake, added, title, withStatus(added.dataSource, status));
}

function setStatus({ added }: UserWithDatabase, page: FakePage, status: string): void {
  fake.editInNotion(page, {
    values: withStatus(added.dataSource, status),
    editedAt: EDIT_AFTER_IMPORT,
  });
}

async function importedTask(): Promise<ImportedTask> {
  const user = await userWithDatabase(fake, TASKS_BASE);
  const page = pageIn(fake, user.added, "Anki");
  await cronAt(IMPORT_RUN);
  return { ...user, page, task: await taskOfPage(user.session, page, IMPORT_RUN) };
}

async function removeBaseAndAddAgain({ session, added }: UserWithDatabase): Promise<void> {
  await deleteDatabase(session, added.database.id, REMOVED_AT);
  await addDatabase(
    session,
    added.dataSource,
    { projectMode: "none", blockPosition: "none", timeProperties: true },
    ADDED_AGAIN_AT,
  );
}

describe("импорт не меняет Notion", () => {
  it("5. задачи не попадают в очередь, ни первый, ни следующие запуски cron не отправляют ничего, кроме query pull", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    ["Anki", "Отчёт", "Шахматы"].forEach((title) => pageIn(fake, user.added, title));
    const requests = await fake.requestsExceptPullDuring(async () => {
      await cronAt(IMPORT_RUN);
      await cronAt(NEXT_RUN);
      await cronAt(LATER_RUN);
    });

    expect(requests).toEqual([]);
    expect(await activeTasks(user.session, LATER_RUN)).toHaveLength(3);
    expect(await syncStatus(user.session, LATER_RUN)).toMatchObject({ pendingTasks: 0 });
  });
});

describe("выбор записей по статусу", () => {
  it("10. страница со статусом из skippedStatusIds не импортируется", async () => {
    const user = await userWithStatuses();
    pageWithStatus(user, DONE);
    await cronAt(IMPORT_RUN);

    expect(await activeTasks(user.session, IMPORT_RUN)).toEqual([]);
  });

  it("10. страница с разрешённым статусом импортируется", async () => {
    const user = await userWithStatuses();
    const page = pageWithStatus(user, IN_PROGRESS);
    await cronAt(IMPORT_RUN);

    expect(await taskOfPage(user.session, page, IMPORT_RUN)).toMatchObject({ title: "Anki" });
  });

  it("10. страница без значения статуса импортируется", async () => {
    const user = await userWithStatuses();
    const page = pageIn(fake, user.added, "Anki", withoutStatus(user.added.dataSource));
    await cronAt(IMPORT_RUN);

    expect(await taskOfPage(user.session, page, IMPORT_RUN)).toMatchObject({ title: "Anki" });
  });

  it("10. страница с новым статусом, добавленным в Notion позже, импортируется", async () => {
    const user = await userWithStatuses();
    const field = statusFieldOf(user.added.dataSource);
    const page = pageIn(fake, user.added, "Anki", {
      [field.id]: { status: { id: NEW_STATUS_ID, name: "На паузе", color: "default" } },
    });
    await cronAt(IMPORT_RUN);

    expect(await taskOfPage(user.session, page, IMPORT_RUN)).toMatchObject({ title: "Anki" });
  });

  it("11. страница в Done меняет статус на In progress и last_edited_time: следующий pull создаёт задачу", async () => {
    const user = await userWithStatuses();
    const page = pageWithStatus(user, DONE);
    await cronAt(IMPORT_RUN);
    setStatus(user, page, IN_PROGRESS);
    await cronAt(NEXT_RUN);

    expect(await taskOfPage(user.session, page, NEXT_RUN)).toMatchObject({ title: "Anki" });
  });

  it("12. импортированная страница переходит в Done: задача остаётся", async () => {
    const user = await userWithStatuses();
    const page = pageWithStatus(user, IN_PROGRESS);
    await cronAt(IMPORT_RUN);
    const task = await taskOfPage(user.session, page, IMPORT_RUN);
    setStatus(user, page, DONE);
    await cronAt(NEXT_RUN);

    expect(await readTask(user.session, task.id, NEXT_RUN)).toMatchObject({
      archived: false,
      notionPageUrl: page.url,
    });
  });
});

describe("изменение skippedStatusIds", () => {
  it("13. PATCH убирает ID: следующий cron отправляет query без filter, и страницы с этим статусом становятся задачами", async () => {
    const user = await userWithStatuses();
    const page = pageWithStatus(user, DONE);
    await cronAt(IMPORT_RUN);
    await updateDatabase(
      user.session,
      user.added.database.id,
      { skippedStatusIds: [] },
      IMPORT_RUN,
    );
    const query = onlyCall(await fake.queriesDuring(() => cronAt(NEXT_RUN)));

    expect(filterOf(query)).toBeUndefined();
    expect(await taskOfPage(user.session, page, NEXT_RUN)).toMatchObject({ title: "Anki" });
  });

  it("13. PATCH только добавляет ID: query остаётся с on_or_after, импортированная задача не меняется", async () => {
    const user = await userWithStatuses();
    const page = pageWithStatus(user, IN_PROGRESS);
    await cronAt(IMPORT_RUN);
    const task = await taskOfPage(user.session, page, IMPORT_RUN);
    await updateDatabase(
      user.session,
      user.added.database.id,
      {
        skippedStatusIds: [
          ...user.added.database.skippedStatusIds,
          ...statusIds(user.added.dataSource, [IN_PROGRESS]),
        ],
      },
      IMPORT_RUN,
    );
    const query = onlyCall(await fake.queriesDuring(() => cronAt(NEXT_RUN)));

    expect(cursorOf(query)).toBe(Date.parse(atMinute(3).now));
    expect(await readTask(user.session, task.id, NEXT_RUN)).toMatchObject({
      archived: false,
      notionPageUrl: page.url,
    });
  });
});

describe("название страницы", () => {
  it("14. страница с пустым названием не импортируется", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    pageIn(fake, user.added, "");
    await cronAt(IMPORT_RUN);

    expect(await activeTasks(user.session, IMPORT_RUN)).toEqual([]);
  });

  it("14. после появления названия и нового last_edited_time страница импортируется", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    const page = pageIn(fake, user.added, "");
    await cronAt(IMPORT_RUN);
    fake.editInNotion(page, { title: "Anki", editedAt: EDIT_AFTER_IMPORT });
    await cronAt(NEXT_RUN);

    expect(await taskOfPage(user.session, page, NEXT_RUN)).toMatchObject({ title: "Anki" });
  });
});

describe("повторная обработка", () => {
  it("15. повторный cron по той же странице не создаёт вторую задачу", async () => {
    const { session } = await importedTask();
    await cronAt(NEXT_RUN);

    expect(await activeTasks(session, NEXT_RUN)).toHaveLength(1);
  });
});

describe("база убрана и добавлена снова", () => {
  it("16. активная задача без страницы с тем же названием в том же проекте связывается со страницей, новая не создаётся", async () => {
    const user = await importedTask();
    await removeBaseAndAddAgain(user);
    await cronAt(NEXT_RUN);

    expect(await activeTasks(user.session, NEXT_RUN)).toMatchObject([
      { id: user.task.id, notionPageUrl: user.page.url },
    ]);
  });

  it("16. без сессий связанная задача не попадает в очередь: PATCH страницы не уходит", async () => {
    const user = await importedTask();
    await removeBaseAndAddAgain(user);

    expect(await fake.updatesDuring(user.page, () => cronAt(NEXT_RUN))).toEqual([]);
  });

  it("16. у задачи с сессиями после cron по странице уходит PATCH", async () => {
    const user = await importedTask();
    await addSession(
      user.session,
      user.task.id,
      { startedAt: atMinute(10).now, endedAt: atMinute(11).now },
      atMinute(11),
    );
    await removeBaseAndAddAgain(user);

    onlyCall(await fake.updatesDuring(user.page, () => cronAt(NEXT_RUN)));
  });

  it("16. задача с тем же названием в другом проекте не связывается, создаётся новая", async () => {
    const user = await importedTask();
    const work = await createProject(user.session, { name: "Работа" }, IMPORT_RUN);
    await updateTask(user.session, user.task.id, { projectId: work.id }, IMPORT_RUN);
    await removeBaseAndAddAgain(user);
    await cronAt(NEXT_RUN);
    const project = await onlyProjectNamed(user.session, TASKS_TITLE, NEXT_RUN);

    expect(await taskOfPage(user.session, user.page, NEXT_RUN)).toMatchObject({
      projectId: project.id,
    });
    expect(await readTask(user.session, user.task.id, NEXT_RUN)).toMatchObject({
      projectId: work.id,
      notionPageUrl: null,
    });
  });

  it("16. архивная задача с тем же названием не связывается, создаётся новая", async () => {
    const user = await importedTask();
    await archiveTask(user.session, user.task.id, IMPORT_RUN);
    await removeBaseAndAddAgain(user);
    await cronAt(NEXT_RUN);

    expect((await taskOfPage(user.session, user.page, NEXT_RUN)).id).not.toBe(user.task.id);
    expect(await readTask(user.session, user.task.id, NEXT_RUN)).toMatchObject({
      archived: true,
      notionPageUrl: null,
    });
  });
});
