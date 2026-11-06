import { beforeEach, describe, expect, it } from "vitest";
import { atMinute } from "./harness/clock.ts";
import { addSession } from "./harness/manual-sessions.ts";
import { fakeNotionBlocks, type FakeNotionBlocks } from "./harness/notion-blocks.ts";
import { updateDatabase } from "./harness/notion-databases.ts";
import {
  EDIT_AFTER_IMPORT,
  IMPORT_RUN,
  LAST_RUN,
  LATER_RUN,
  NEXT_RUN,
  TASKS_TITLE,
  onlyProjectNamed,
  pageIn,
  projectOfPage,
  taskOfPage,
} from "./harness/notion-import.ts";
import type { FakePage, PageValue } from "./harness/notion-pages.ts";
import {
  fakeNotionPull,
  optionsProperty,
  selectValue,
  sendsProperty,
  userWithDatabase,
  type FakeNotionPull,
  type NotionOption,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import {
  cronAt,
  pagePropertiesOf,
  propertyNamed,
  syncStatus,
  titlePropertyId,
  trackerPropertyId,
  type DatabaseSetup,
  type SyncedTask,
} from "./harness/notion-sync.ts";
import { onlyCall } from "./harness/notion.ts";
import { updateProject, type TestProject } from "./harness/projects.ts";

const AREA = "Сфера";
const SPORT: NotionOption = { name: "Спорт", color: "green" };
const SESSION_RECORDED = atMinute(12);
const RENAMED = "Работа";
const OWN_FIELD_WITH_BLOCK: DatabaseSetup = { title: TASKS_TITLE, blockPosition: "start" };
const OWN_FIELD: DatabaseSetup = { title: TASKS_TITLE };
const BY_SELECT: DatabaseSetup = {
  title: TASKS_TITLE,
  properties: [optionsProperty(AREA, "select", [SPORT])],
  projectProperty: AREA,
};

type ImportedTask = UserWithDatabase & {
  page: FakePage;
  task: SyncedTask;
  project: TestProject;
};

let fake: FakeNotionPull;
let blocks: FakeNotionBlocks;

beforeEach(() => {
  fake = fakeNotionPull();
  blocks = fakeNotionBlocks(fake.pages);
});

async function importedTask(
  database: DatabaseSetup,
  values: Record<string, PageValue> = {},
): Promise<ImportedTask> {
  const user = await userWithDatabase(fake, database);
  const page = pageIn(fake, user.added, "Anki", values);
  await cronAt(IMPORT_RUN);
  return {
    ...user,
    page,
    task: await taskOfPage(user.session, page, IMPORT_RUN),
    project: await onlyProjectNamed(user.session, TASKS_TITLE, IMPORT_RUN),
  };
}

function recordSession({ session, task }: ImportedTask): Promise<unknown> {
  return addSession(
    session,
    task.id,
    { startedAt: atMinute(10).now, endedAt: atMinute(11).now },
    SESSION_RECORDED,
  );
}

async function pushedTask(database: DatabaseSetup): Promise<ImportedTask> {
  const imported = await importedTask(database);
  await recordSession(imported);
  await cronAt(SESSION_RECORDED);
  return imported;
}

describe("первый push импортированной задачи", () => {
  it("17. после сессии и cron уходит PATCH страницы с проектом задачи в ⏱ Проект, новая страница не создаётся, title не отправляется", async () => {
    const imported = await importedTask(OWN_FIELD_WITH_BLOCK);
    const source = imported.added.dataSource;
    await recordSession(imported);
    const update = onlyCall(
      await fake.updatesDuring(imported.page, () => cronAt(SESSION_RECORDED)),
    );

    expect(pagePropertiesOf(update)).toMatchObject({
      [trackerPropertyId(source, "project")]: { select: { name: TASKS_TITLE } },
      [trackerPropertyId(source, "spentHours")]: { number: 0.02 },
    });
    expect(sendsProperty(update, titlePropertyId(source))).toBe(false);
    expect(fake.pages.creations()).toEqual([]);
  });

  it("17. после сессии и cron на странице создаётся блок с временем", async () => {
    const imported = await importedTask(OWN_FIELD_WITH_BLOCK);
    await recordSession(imported);
    await cronAt(SESSION_RECORDED);

    expect(blocks.timeBlockOn(imported.page).lines).toHaveLength(1);
  });
});

describe("задача без успешного push", () => {
  it("18. переименование проекта не ставит её в очередь и не отправляет запросов к странице", async () => {
    const { session, project } = await importedTask(OWN_FIELD);
    await updateProject(session, project.id, { name: RENAMED }, IMPORT_RUN);

    expect(await syncStatus(session, IMPORT_RUN)).toMatchObject({ pendingTasks: 0 });
    expect(await fake.requestsExceptPullDuring(() => cronAt(NEXT_RUN))).toEqual([]);
  });

  it("18. смена blockPosition базы не ставит её в очередь и не отправляет запросов к странице", async () => {
    const { session, added } = await importedTask(OWN_FIELD);
    await updateDatabase(session, added.database.id, { blockPosition: "start" }, IMPORT_RUN);

    expect(await syncStatus(session, IMPORT_RUN)).toMatchObject({ pendingTasks: 0 });
    expect(await fake.requestsExceptPullDuring(() => cronAt(NEXT_RUN))).toEqual([]);
  });
});

describe("задача с прошедшим push", () => {
  it("18. переименование проекта отправляет PATCH страницы с новым названием проекта", async () => {
    const { session, added, page, project } = await pushedTask(OWN_FIELD);
    await updateProject(session, project.id, { name: RENAMED }, NEXT_RUN);
    const update = onlyCall(await fake.updatesDuring(page, () => cronAt(NEXT_RUN)));

    expect(pagePropertiesOf(update)).toMatchObject({
      [trackerPropertyId(added.dataSource, "project")]: { select: { name: RENAMED } },
    });
  });

  it("18. смена blockPosition базы создаёт блок на странице", async () => {
    const { session, added, page } = await pushedTask(OWN_FIELD);
    await updateDatabase(session, added.database.id, { blockPosition: "start" }, NEXT_RUN);
    const run = await blocks.callsDuring(() => cronAt(NEXT_RUN));

    onlyCall(run.appends(page.id));
  });
});

describe("обычный pull импортированной задачи", () => {
  function areaOf({ added }: ImportedTask): string {
    return propertyNamed(added.dataSource, AREA).id;
  }

  function setArea(imported: ImportedTask, option: NotionOption | null, now: string): void {
    fake.editInNotion(imported.page, {
      values: { [areaOf(imported)]: selectValue(option) },
      editedAt: { now },
    });
  }

  it("19. переименование страницы в Notion меняет название задачи", async () => {
    const { session, page } = await importedTask(BY_SELECT);
    fake.editInNotion(page, { title: "Anki: испанский", editedAt: EDIT_AFTER_IMPORT });
    await cronAt(NEXT_RUN);

    expect(await taskOfPage(session, page, NEXT_RUN)).toMatchObject({ title: "Anki: испанский" });
  });

  it("19. поле изменено на «Спорт»: задача в проекте «Спорт»", async () => {
    const imported = await importedTask(BY_SELECT);
    setArea(imported, SPORT, EDIT_AFTER_IMPORT.now);
    await cronAt(NEXT_RUN);

    expect(await projectOfPage(imported.session, imported.page, NEXT_RUN)).toMatchObject({
      name: SPORT.name,
    });
  });

  it("19. поле очищено: задача возвращается в проект с названием базы", async () => {
    const imported = await importedTask(BY_SELECT);
    setArea(imported, SPORT, EDIT_AFTER_IMPORT.now);
    await cronAt(NEXT_RUN);
    setArea(imported, null, LATER_RUN.now);
    await cronAt(LAST_RUN);

    expect(await projectOfPage(imported.session, imported.page, LAST_RUN)).toMatchObject({
      id: imported.project.id,
      name: TASKS_TITLE,
    });
  });
});
