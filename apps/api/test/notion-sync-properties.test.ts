import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCall } from "./harness/index.ts";
import { atMinute } from "./harness/clock.ts";
import { addSession, editSession } from "./harness/manual-sessions.ts";
import { TIME_FIELDS, type Locale } from "./harness/notion-databases.ts";
import {
  TASKS_DATABASE,
  cronAt,
  fakeNotionSync,
  loginForSync,
  pagePropertiesOf,
  propertyNamed,
  richTextValue,
  titlePropertyId,
  titleValue,
  trackerPropertyId,
  userWithQueuedTask,
  userWithTaskPage,
  type FakeNotionSync,
  type UserWithTaskPage,
} from "./harness/notion-sync.ts";
import { onlyCall } from "./harness/notion.ts";
import { createProject } from "./harness/projects.ts";
import { createTask, updateTask } from "./harness/tasks.ts";
import { startTimer, stopTimer } from "./harness/timers.ts";

const AREA = "Направление";

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

async function runningTaskWithPage(): Promise<UserWithTaskPage> {
  const queued = await userWithQueuedTask(fake);
  await startTimer(queued.session, queued.task.id, atMinute(0));
  await cronAt(atMinute(0));
  return { ...queued, page: await fake.pageOfTask(queued.session, queued.task.id) };
}

function propertyKeysOf(call: ExternalCall): string[] {
  return Object.keys(pagePropertiesOf(call)).toSorted();
}

describe("значения полей с временем", () => {
  it.each<[Locale, string]>([
    ["ru", "2 ч 30 мин"],
    ["en", "2 h 30 min"],
  ])(
    "5. сессия 2 ч 30 мин у пользователя с locale %s: spentHours = 2.5, spent = «%s»",
    async (locale, spent) => {
      const session = await loginForSync(locale);
      const { tasks } = await fake.connectNotion(session, {
        databases: { tasks: TASKS_DATABASE },
      });
      const source = tasks.dataSource;
      const task = await createTask(session, { title: "Anki" }, atMinute(0));
      const recorded = await addSession(
        session,
        task.id,
        { startedAt: atMinute(0).now, endedAt: atMinute(150).now },
        atMinute(160),
      );
      await cronAt(atMinute(160));

      expect(pagePropertiesOf(onlyCall(fake.pages.creations()))).toMatchObject({
        [trackerPropertyId(source, "spentHours")]: { number: 2.5 },
        [trackerPropertyId(source, "spent")]: richTextValue(spent),
        [trackerPropertyId(source, "lastTracked")]: { date: { start: recorded.startedAt } },
      });
    },
  );
});

describe("склейка изменений", () => {
  it("6. запуск, остановка и правка заметки до cron дают ровно один PATCH /v1/pages/{id}", async () => {
    const { session, task, page } = await userWithTaskPage(fake);
    const updates = await fake.updatesDuring(page, async () => {
      await startTimer(session, task.id, atMinute(1));
      const stopped = await stopTimer(session, task.id, atMinute(2));
      await editSession(session, stopped.id, { note: "повторил карточки" }, atMinute(3));
      await cronAt(atMinute(4));
    });

    expect(updates).toHaveLength(1);
  });

  it("8. без изменений в трекере повторный cron не отправляет запросов", async () => {
    await userWithTaskPage(fake);
    const requests = await fake.requestsDuring(async () => {
      await cronAt(atMinute(1));
      await cronAt(atMinute(30));
    });

    expect(requests).toEqual([]);
  });
});

describe("идущий таймер", () => {
  it("7. cron через 5 минут после последнего синка ничего не отправляет", async () => {
    await runningTaskWithPage();

    expect(await fake.requestsDuring(() => cronAt(atMinute(5)))).toEqual([]);
  });

  it("7. cron через 10 минут после последнего синка отправляет PATCH с обновлённым временем и running: true", async () => {
    const { tasks, page } = await runningTaskWithPage();
    const source = tasks.dataSource;
    await cronAt(atMinute(5));
    const update = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(10))));

    expect(pagePropertiesOf(update)).toMatchObject({
      [trackerPropertyId(source, "spentHours")]: { number: 0.17 },
      [trackerPropertyId(source, "spent")]: richTextValue("10 мин"),
      [trackerPropertyId(source, "running")]: { checkbox: true },
    });
  });
});

describe("название задачи", () => {
  it("9. переименование задачи отправляет новое title", async () => {
    const { session, tasks, task, page } = await userWithTaskPage(fake);
    await updateTask(session, task.id, { title: "Anki: испанский" }, atMinute(1));
    const update = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(1))));

    expect(pagePropertiesOf(update)).toMatchObject({
      [titlePropertyId(tasks.dataSource)]: titleValue("Anki: испанский"),
    });
  });

  it("9. изменение только времени отправляет PATCH без title", async () => {
    const { session, tasks, task, page } = await userWithTaskPage(fake);
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(1).now, endedAt: atMinute(31).now },
      atMinute(40),
    );
    const update = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(40))));

    expect(pagePropertiesOf(update)).not.toHaveProperty(titlePropertyId(tasks.dataSource));
  });
});

describe("проект на странице", () => {
  it("10. режим none: в запросах к странице нет поля проекта, только title и поля с временем", async () => {
    const session = await loginForSync();
    const { tasks } = await fake.connectNotion(session, {
      databases: { tasks: { ...TASKS_DATABASE, projectMode: "none" } },
    });
    const source = tasks.dataSource;
    const work = await createProject(session, { name: "Работа" }, atMinute(0));
    const study = await createProject(session, { name: "Учёба" }, atMinute(0));
    const task = await createTask(session, { title: "Отчёт", projectId: work.id }, atMinute(0));
    await cronAt(atMinute(0));
    await updateTask(session, task.id, { title: "Курсовая", projectId: study.id }, atMinute(1));
    await cronAt(atMinute(1));
    const allowedKeys = [
      titlePropertyId(source),
      ...TIME_FIELDS.map((field) => trackerPropertyId(source, field)),
    ].toSorted();

    expect(propertyKeysOf(onlyCall(fake.pages.creations()))).toEqual(allowedKeys);
    expect(allowedKeys).toEqual(
      expect.arrayContaining(propertyKeysOf(onlyCall(fake.pages.updates()))),
    );
  });

  it("11. multi_select со значениями [SFEDU, Спорт] при переносе задачи из «Спорт» в «Учёба»: в PATCH уходит [SFEDU, Учёба]", async () => {
    const session = await loginForSync();
    const { tasks } = await fake.connectNotion(session, {
      databases: {
        tasks: {
          ...TASKS_DATABASE,
          properties: [{ name: AREA, type: "multi_select" }],
          projectProperty: AREA,
        },
      },
    });
    const area = propertyNamed(tasks.dataSource, AREA);
    const sport = await createProject(session, { name: "Спорт" }, atMinute(0));
    const study = await createProject(session, { name: "Учёба" }, atMinute(0));
    const task = await createTask(session, { title: "Зачёт", projectId: sport.id }, atMinute(0));
    await cronAt(atMinute(0));
    const page = await fake.pageOfTask(session, task.id);
    fake.pages.setMultiSelect(page, area, ["SFEDU", "Спорт"]);
    await updateTask(session, task.id, { projectId: study.id }, atMinute(1));
    const update = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(1))));

    expect(pagePropertiesOf(update)).toMatchObject({
      [area.id]: { multi_select: [{ name: "SFEDU" }, { name: "Учёба" }] },
    });
  });
});

describe("база без полей с временем", () => {
  const withoutTimeFields = { ...TASKS_DATABASE, timeProperties: false };

  it("21. timeProperties = false: в POST /v1/pages нет spentHours, spent, running и lastTracked", async () => {
    const { tasks } = await userWithTaskPage(fake, withoutTimeFields);
    const source = tasks.dataSource;

    expect(propertyKeysOf(onlyCall(fake.pages.creations()))).toEqual(
      [titlePropertyId(source), trackerPropertyId(source, "project")].toSorted(),
    );
  });

  it("21. timeProperties = false: запуск и остановка таймера задачи со страницей PATCH страницы не отправляют", async () => {
    const { session, task, page } = await userWithTaskPage(fake, withoutTimeFields);
    const updates = await fake.updatesDuring(page, async () => {
      await startTimer(session, task.id, atMinute(1));
      await cronAt(atMinute(1));
      await cronAt(atMinute(12));
      await stopTimer(session, task.id, atMinute(13));
      await cronAt(atMinute(13));
    });

    expect(updates).toEqual([]);
  });
});
