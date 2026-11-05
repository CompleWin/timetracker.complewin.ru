import { beforeEach, describe, expect, it } from "vitest";
import { atMinute } from "./harness/clock.ts";
import { deleteDatabase } from "./harness/notion-databases.ts";
import {
  FUN_DATABASE,
  TASKS_DATABASE,
  TASK_TITLE,
  cronAt,
  exportTasks,
  fakeNotionSync,
  loginForSync,
  readTask,
  richTextValue,
  syncStatus,
  titlePropertyId,
  titleValue,
  trackerPropertyId,
  userWithQueuedTask,
  type FakeNotionSync,
} from "./harness/notion-sync.ts";
import { jsonBodyOf, onlyCall } from "./harness/notion.ts";
import { createProject, updateProject } from "./harness/projects.ts";
import { createTask, updateTask } from "./harness/tasks.ts";
import { startTimer, stopTimer } from "./harness/timers.ts";

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

describe("в какую базу попадает новая страница", () => {
  it("1. задача без проекта при базе по умолчанию: cron отправляет POST /v1/pages в базу по умолчанию, title и все свои поля заданы по ID", async () => {
    const { tasks } = await userWithQueuedTask(fake);
    const source = tasks.dataSource;
    await cronAt(atMinute(0));

    expect(jsonBodyOf(onlyCall(fake.pages.creations()))).toMatchObject({
      parent: { type: "data_source_id", data_source_id: source.id },
      properties: {
        [titlePropertyId(source)]: titleValue(TASK_TITLE),
        [trackerPropertyId(source, "spentHours")]: { number: 0 },
        [trackerPropertyId(source, "spent")]: richTextValue("0 мин"),
        [trackerPropertyId(source, "running")]: { checkbox: false },
        [trackerPropertyId(source, "lastTracked")]: { date: null },
        [trackerPropertyId(source, "project")]: { select: null },
      },
    });
  });

  it("1. у задачи без страницы notionPageUrl и notionDatabaseId равны null, после cron появляются", async () => {
    const { session, tasks, task } = await userWithQueuedTask(fake);

    expect(await readTask(session, task.id, atMinute(0))).toMatchObject({
      notionPageUrl: null,
      notionDatabaseId: null,
    });
    await cronAt(atMinute(0));
    expect(await readTask(session, task.id, atMinute(0))).toMatchObject({
      notionPageUrl: fake.pages.last().url,
      notionDatabaseId: tasks.database.id,
    });
  });

  it("2. задача проекта, привязанного к «Развлечениям», создаётся в «Развлечениях», хотя по умолчанию стоят «Задачи»", async () => {
    const session = await loginForSync();
    const { tasks, fun } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
    });
    const games = await createProject(
      session,
      { name: "Игры", notionDatabaseId: fun.database.id },
      atMinute(0),
    );
    const task = await createTask(session, { title: "Ведьмак", projectId: games.id }, atMinute(0));
    await cronAt(atMinute(0));

    expect(tasks.database).toMatchObject({ isDefault: true });
    expect(jsonBodyOf(onlyCall(fake.pages.creations()))).toMatchObject({
      parent: { type: "data_source_id", data_source_id: fun.dataSource.id },
    });
    expect(await readTask(session, task.id, atMinute(0))).toMatchObject({
      notionDatabaseId: fun.database.id,
    });
  });

  it("3. без базы по умолчанию и без базы у проекта события по задаче не попадают в очередь, cron ничего не отправляет", async () => {
    const session = await loginForSync();
    await fake.connectNotion(session, {
      databases: { tasks: { ...TASKS_DATABASE, isDefault: false } },
    });
    const study = await createProject(session, { name: "Учёба" }, atMinute(0));
    const task = await createTask(
      session,
      { title: "Матанализ", projectId: study.id },
      atMinute(0),
    );
    await updateTask(session, task.id, { title: "Матан" }, atMinute(1));
    await startTimer(session, task.id, atMinute(1));
    await stopTimer(session, task.id, atMinute(2));

    expect(await syncStatus(session, atMinute(2))).toMatchObject({ pendingTasks: 0 });
    expect(await fake.requestsDuring(() => cronAt(atMinute(3)))).toEqual([]);
  });

  it("4. задача со страницей в «Задачах» перенесена в проект «Развлечений»: cron отправляет PATCH той же страницы и не создаёт новых", async () => {
    const session = await loginForSync();
    const { tasks, fun } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_DATABASE, fun: FUN_DATABASE },
    });
    const games = await createProject(
      session,
      { name: "Игры", notionDatabaseId: fun.database.id },
      atMinute(0),
    );
    const task = await createTask(session, { title: "Ведьмак" }, atMinute(0));
    await cronAt(atMinute(0));
    const page = await fake.pageOfTask(session, task.id);
    await updateTask(session, task.id, { projectId: games.id }, atMinute(1));
    const creations = await fake.creationsDuring(() => cronAt(atMinute(1)));

    onlyCall(fake.pages.updates(page));
    expect(creations).toEqual([]);
    expect(await readTask(session, task.id, atMinute(1))).toMatchObject({
      notionPageUrl: page.url,
      notionDatabaseId: tasks.database.id,
    });
  });
});

describe("POST /api/notion/export", () => {
  it("19. три активные задачи без страниц с определяемой базой и одна без базы: 202 { queued: 3 }", async () => {
    const session = await loginForSync();
    const { tasks } = await fake.connectNotion(session, {
      databases: { tasks: { ...TASKS_DATABASE, isDefault: false } },
    });
    const work = await createProject(session, { name: "Работа" }, atMinute(0));
    for (const title of ["Отчёт", "Созвон", "Ревью"]) {
      await createTask(session, { title, projectId: work.id }, atMinute(0));
    }
    await createTask(session, { title: "Без базы" }, atMinute(0));
    await updateProject(session, work.id, { notionDatabaseId: tasks.database.id }, atMinute(1));

    expect(await exportTasks(session, atMinute(2))).toMatchObject({
      status: 202,
      body: { queued: 3 },
    });
    expect(await syncStatus(session, atMinute(2))).toMatchObject({ pendingTasks: 3 });
  });
});

describe("удаление базы", () => {
  it("20. у задач со страницами удалённой базы notionPageUrl и notionDatabaseId равны null, их элементы пропали из очереди", async () => {
    const session = await loginForSync();
    const { tasks, fun } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_DATABASE, fun: { ...FUN_DATABASE, isDefault: true } },
    });
    const work = await createProject(
      session,
      { name: "Работа", notionDatabaseId: tasks.database.id },
      atMinute(0),
    );
    const report = await createTask(session, { title: "Отчёт", projectId: work.id }, atMinute(0));
    const movie = await createTask(session, { title: "Кино" }, atMinute(0));
    await cronAt(atMinute(0));
    const moviePage = await fake.pageOfTask(session, movie.id);
    await updateTask(session, report.id, { title: "Годовой отчёт" }, atMinute(1));
    await deleteDatabase(session, tasks.database.id, atMinute(2));

    expect(await readTask(session, report.id, atMinute(2))).toMatchObject({
      notionPageUrl: null,
      notionDatabaseId: null,
    });
    expect(await readTask(session, movie.id, atMinute(2))).toMatchObject({
      notionPageUrl: moviePage.url,
      notionDatabaseId: fun.database.id,
    });
    expect(await syncStatus(session, atMinute(2))).toMatchObject({ pendingTasks: 0 });
    expect(await fake.requestsDuring(() => cronAt(atMinute(3)))).toEqual([]);
  });
});
