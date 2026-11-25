import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/api.ts";
import { atMinute, atSecond } from "./harness/clock.ts";
import { external } from "./harness/external.ts";
import { addSession, editSession } from "./harness/manual-sessions.ts";
import { fakeNotionBlocks, lineTexts } from "./harness/notion-blocks.ts";
import {
  addDatabase,
  connectedDatabases,
  trackerFieldName,
  updateDatabase,
} from "./harness/notion-databases.ts";
import { failureResponse, type FakePage, type PageValue } from "./harness/notion-pages.ts";
import {
  SETUP_TIME,
  callsDuring,
  cronAt,
  fakeNotionSync,
  loginForSync,
  pagePropertiesOf,
  richTextValue,
  syncStatus,
  titlePropertyId,
  titleValue,
  trackerPropertyId,
  type FakeNotionSync,
  type SyncedDatabase,
} from "./harness/notion-sync.ts";
import { linkedTask, type LinkedTask } from "./harness/notion-task-pages.ts";
import { NOTION_V1, isRecord, readJson, type FakeDataSource } from "./harness/notion-workspace.ts";
import { expectConnected, onlyCall } from "./harness/notion.ts";
import { createProject } from "./harness/projects.ts";
import { updateTask } from "./harness/tasks.ts";
import { startTimer, stopTimer } from "./harness/timers.ts";

const MANUAL_SETTINGS = { projectMode: "none", blockPosition: "none" } as const;
const HOURS = "Часы";
const DATE = "Начало";
const RUNNING = "Активна";
const TEXT = "Время";
const REQUESTS_PER_RUN = 100;

let fake: FakeNotionSync;
let session: TestSession;

beforeEach(async () => {
  fake = fakeNotionSync();
  session = await loginForSync();
});

function useColumn(propertyId: string) {
  return { mode: "existing", propertyId } as const;
}

async function connectTemplate(): Promise<SyncedDatabase> {
  const dataSource = fake.workspace.dataSource();
  const duplicatedTemplateId = fake.workspace.templatePage(dataSource);
  const opts = { as: session, ...SETUP_TIME };
  const attempt = await fake.notion.start(opts);
  expectConnected(await fake.notion.callback(attempt, opts, { duplicatedTemplateId }));
  const [database] = await connectedDatabases(session, SETUP_TIME);
  if (!database) throw new Error("База из шаблона не подключена");
  await updateDatabase(session, database.id, { blockPosition: "none" }, SETUP_TIME);
  return { database, dataSource };
}

function removeColumn(dataSource: FakeDataSource, id: string, pages: FakePage[]): void {
  dataSource.properties = dataSource.properties.filter((property) => property.id !== id);
  for (const page of pages) {
    page.values.delete(id);
    external.on("PATCH", `${NOTION_V1}/pages/${page.id}`, async (request) => {
      const { properties } = await readJson(request);
      const values = new Map<string, PageValue>();
      if (isRecord(properties)) {
        for (const [key, value] of Object.entries(properties)) {
          const column = dataSource.properties.find(({ id, name }) => key === id || key === name);
          if (!column) {
            return failureResponse({
              status: 400,
              code: "validation_error",
              message: `${key} is not a property that exists.`,
            });
          }
          if (isRecord(value)) values.set(column.id, value);
        }
      }
      for (const [key, value] of values) page.values.set(key, value);
      return Response.json(fake.pages.json(page));
    });
  }
}

function addTime(task: LinkedTask, start: number, end: number, now: number) {
  return addSession(
    session,
    task.task.id,
    { startedAt: atMinute(start).now, endedAt: atMinute(end).now },
    atMinute(now),
  );
}

async function manualHoursAndDate(title: string) {
  const dataSource = fake.workspace.dataSource({
    title: [title],
    properties: [
      { name: HOURS, type: "number" },
      { name: DATE, type: "date" },
    ],
  });
  const hours = fake.workspace.property(dataSource, HOURS).id;
  const date = fake.workspace.property(dataSource, DATE);
  const timeFields = { spentHours: useColumn(hours), lastTracked: useColumn(date.id) };
  const database = await addDatabase(
    session,
    dataSource,
    { ...MANUAL_SETTINGS, timeFields },
    SETUP_TIME,
  );
  return { database, dataSource, hours, date, timeFields };
}

describe("автовосстановление колонок времени Notion", () => {
  it("8.1, 8.2. новое назначение сохраняется и заполняется у изменённой и неизменённой задачи", async () => {
    const template = await connectTemplate();
    const { dataSource } = template;
    const first = await linkedTask(fake, session, template, { title: "Отчёт" });
    const second = await linkedTask(fake, session, template, { title: "Зачёт" });
    const original = trackerPropertyId(dataSource, "spentHours");
    await addTime(first, 1, 121, 310);
    await addTime(second, 1, 301, 310);
    await cronAt(atMinute(310));
    expect(first.page.values.get(original)).toMatchObject({ number: 2 });
    expect(second.page.values.get(original)).toMatchObject({ number: 5 });

    removeColumn(dataSource, original, [first.page, second.page]);
    await addTime(first, 311, 371, 380);
    await cronAt(atMinute(380));
    await cronAt(atMinute(381));

    const restored = trackerPropertyId(dataSource, "spentHours");
    expect(restored).not.toBe(original);
    expect(await connectedDatabases(session, atMinute(381))).toMatchObject([
      { id: template.database.id, timeFields: { spentHours: restored } },
    ]);
    expect(first.page.values.get(restored)).toMatchObject({ number: 3 });
    expect(second.page.values.get(restored)).toMatchObject({ number: 5 });
    expect(await syncStatus(session, atMinute(381))).toMatchObject({ pendingTasks: 0, failed: [] });
    const firstWrites = fake.pages.updates(first.page).map(pagePropertiesOf);
    expect(firstWrites.filter((properties) => Object.hasOwn(properties, restored))).toHaveLength(1);
    expect(
      await callsDuring(
        () => fake.pages.updates(),
        () => cronAt(atMinute(382)),
      ),
    ).toEqual([]);
  });

  it(
    "8.3. заполнение больше лимита продолжается в следующих запусках без повторной записи",
    { timeout: 120_000 },
    async () => {
      const template = await connectTemplate();
      const { dataSource } = template;
      const first = await linkedTask(fake, session, template, { title: "Отчёт" });
      const others: FakePage[] = [];
      for (let index = 1; index <= REQUESTS_PER_RUN; index += 1) {
        const task = await linkedTask(fake, session, template, { title: `Задача ${index}` });
        others.push(task.page);
      }
      const pages = [first.page, ...others];
      const original = trackerPropertyId(dataSource, "spentHours");
      await cronAt(atMinute(1));
      await cronAt(atMinute(2));
      expect(pages.filter((page) => page.values.get(original)?.number === 0).length).toBe(
        pages.length,
      );

      removeColumn(dataSource, original, pages);
      await addTime(first, 3, 63, 70);
      const firstRun = await fake.requestsDuring(() => cronAt(atMinute(70)));
      expect(firstRun.length).toBeLessThanOrEqual(REQUESTS_PER_RUN);
      const restored = trackerPropertyId(dataSource, "spentHours");
      expect(pages.some((page) => !page.values.has(restored))).toBe(true);

      for (const minute of [71, 72, 73]) {
        const run = await fake.requestsDuring(() => cronAt(atMinute(minute)));
        expect(run.length).toBeLessThanOrEqual(REQUESTS_PER_RUN);
      }
      expect(first.page.values.get(restored)).toMatchObject({ number: 1 });
      expect(others.filter((page) => page.values.get(restored)?.number === 0).length).toBe(
        others.length,
      );
      expect(await syncStatus(session, atMinute(73))).toMatchObject({
        pendingTasks: 0,
        failed: [],
      });
      const updatesBeforeIdleRun = fake.pages.updates().length;
      await cronAt(atMinute(74));
      expect(fake.pages.updates()).toHaveLength(updatesBeforeIdleRun);
    },
  );

  it("8.4. вручную выбранная колонка не заменяется одноимённой колонкой с новым ID", async () => {
    await fake.notion.connect(session, undefined, SETUP_TIME);
    const name = trackerFieldName("spentHours", "ru");
    const dataSource = fake.workspace.dataSource({ properties: [{ name, type: "number" }] });
    const original = fake.workspace.property(dataSource, name);
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeFields: { spentHours: useColumn(original.id) } },
      SETUP_TIME,
    );
    const task = await linkedTask(fake, session, { database, dataSource }, { title: "Отчёт" });
    await addTime(task, 1, 121, 130);
    await cronAt(atMinute(130));
    expect(task.page.values.get(original.id)).toMatchObject({ number: 2 });

    removeColumn(dataSource, original.id, [task.page]);
    const replacement = { ...original, id: "replacement-hours" };
    dataSource.properties.push(replacement);
    task.page.values.set(replacement.id, { number: 17 });
    await addTime(task, 131, 191, 200);
    await cronAt(atMinute(200));
    await cronAt(atMinute(201));

    expect(task.page.values.get(replacement.id)).toMatchObject({ number: 17 });
    expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
  });
});

describe("повтор синхронизации при отключении удалённой колонки Notion", () => {
  it("9.1, 9.2. отказ оставляет прежнее время, отключение даты повторяет только ошибочную отправку", async () => {
    await fake.notion.connect(session, undefined, SETUP_TIME);
    const source = await manualHoursAndDate("Работа");
    const first = await linkedTask(fake, session, source, { title: "Отчёт" });
    const second = await linkedTask(fake, session, source, { title: "Зачёт" });
    await addTime(first, 1, 121, 130);
    await addTime(second, 1, 61, 130);
    await cronAt(atMinute(130));
    expect(first.page.values.get(source.hours)).toMatchObject({ number: 2 });
    expect(second.page.values.get(source.hours)).toMatchObject({ number: 1 });

    removeColumn(source.dataSource, source.date.id, [first.page, second.page]);
    await addTime(first, 131, 191, 200);
    const rejected = await fake.updatesDuring(first.page, () => cronAt(atMinute(200)));
    expect(rejected.map(pagePropertiesOf)).toContainEqual(
      expect.objectContaining({
        [source.hours]: { number: 3 },
        [source.date.id]: { date: { start: atMinute(131).now } },
      }),
    );
    expect(await syncStatus(session, atMinute(200))).toMatchObject({
      failed: [{ taskId: first.task.id }],
    });
    expect(first.page.values.get(source.hours)).toMatchObject({ number: 2 });

    const stableUpdates = fake.pages.updates(second.page).length;
    const retried = await fake.updatesDuring(first.page, async () => {
      await updateDatabase(
        session,
        source.database.id,
        { timeFields: { spentHours: useColumn(source.hours) } },
        atMinute(201),
      );
      await cronAt(atMinute(202));
    });
    const retriedProperties = retried.map(pagePropertiesOf);
    expect(retriedProperties).toContainEqual(
      expect.objectContaining({ [source.hours]: { number: 3 } }),
    );
    for (const properties of retriedProperties) {
      expect(properties).not.toHaveProperty(source.date.id);
    }
    expect(first.page.values.get(source.hours)).toMatchObject({ number: 3 });
    expect(fake.pages.updates(second.page)).toHaveLength(stableUpdates);
    expect(await syncStatus(session, atMinute(202))).toMatchObject({ pendingTasks: 0, failed: [] });
  });

  it("9.3. повтор ограничен изменённой базой, сохранение тех же назначений его не запускает", async () => {
    await fake.notion.connect(session, undefined, SETUP_TIME);
    const work = await manualHoursAndDate("Работа");
    const study = await manualHoursAndDate("Учёба");
    const first = await linkedTask(fake, session, work, { title: "Отчёт" });
    const second = await linkedTask(fake, session, study, { title: "Зачёт" });
    await cronAt(atMinute(1));
    removeColumn(work.dataSource, work.date.id, [first.page]);
    removeColumn(study.dataSource, study.date.id, [second.page]);
    await addTime(first, 2, 62, 70);
    await addTime(second, 2, 62, 70);
    await cronAt(atMinute(70));
    const before = await syncStatus(session, atMinute(70));
    expect(before.failed.map(({ taskId }) => taskId).toSorted()).toEqual(
      [first.task.id, second.task.id].toSorted(),
    );

    work.dataSource.properties.push(work.date);
    const afterUnchangedSave = await callsDuring(
      () => fake.pages.updates(),
      async () => {
        await updateDatabase(
          session,
          work.database.id,
          { timeFields: work.timeFields },
          atMinute(71),
        );
        await cronAt(atMinute(72));
      },
    );
    expect(afterUnchangedSave).toEqual([]);
    expect((await syncStatus(session, atMinute(72))).failed).toEqual(before.failed);

    const otherUpdates = await fake.updatesDuring(second.page, async () => {
      await updateDatabase(
        session,
        work.database.id,
        { timeFields: { spentHours: useColumn(work.hours) } },
        atMinute(73),
      );
      await cronAt(atMinute(74));
    });
    expect(first.page.values.get(work.hours)).toMatchObject({ number: 1 });
    expect(otherUpdates).toEqual([]);
    expect(await syncStatus(session, atMinute(74))).toMatchObject({
      failed: [{ taskId: second.task.id }],
    });
  });
});

describe("сравнение значений полей времени Notion", () => {
  it("10.1. флажок меняется при старте и остановке, через 10 и 20 минут новых PATCH нет", async () => {
    await fake.notion.connect(session, undefined, SETUP_TIME);
    const dataSource = fake.workspace.dataSource({
      properties: [{ name: RUNNING, type: "checkbox" }],
    });
    const running = fake.workspace.property(dataSource, RUNNING).id;
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeFields: { running: useColumn(running) } },
      SETUP_TIME,
    );
    const { task, page } = await linkedTask(
      fake,
      session,
      { database, dataSource },
      { title: "Отчёт" },
    );
    await cronAt(SETUP_TIME);
    await startTimer(session, task.id, atMinute(1));
    const started = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(1))));
    expect(pagePropertiesOf(started)).toMatchObject({ [running]: { checkbox: true } });

    expect(await fake.updatesDuring(page, () => cronAt(atMinute(11)))).toEqual([]);
    expect(await fake.updatesDuring(page, () => cronAt(atMinute(21)))).toEqual([]);

    await stopTimer(session, task.id, atMinute(22));
    const stopped = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(22))));
    expect(pagePropertiesOf(stopped)).toMatchObject({ [running]: { checkbox: false } });
  });

  it.each([
    { field: "spentHours", type: "number", end: 3620, unchanged: 3601, value: { number: 1.01 } },
    {
      field: "spent",
      type: "rich_text",
      end: 3660,
      unchanged: 3620,
      value: richTextValue("1 ч 1 мин"),
    },
  ] as const)(
    "10.2. $field отправляется при изменении значения колонки",
    async ({ field, type, end, unchanged, value }) => {
      await fake.notion.connect(session, undefined, SETUP_TIME);
      const dataSource = fake.workspace.dataSource({ properties: [{ name: TEXT, type }] });
      const column = fake.workspace.property(dataSource, TEXT).id;
      const database = await addDatabase(
        session,
        dataSource,
        { ...MANUAL_SETTINGS, timeFields: { [field]: useColumn(column) } },
        SETUP_TIME,
      );
      const linked = await linkedTask(fake, session, { database, dataSource }, { title: "Отчёт" });
      const recorded = await addTime(linked, 0, 60, 70);
      await cronAt(atMinute(70));

      await editSession(session, recorded.id, { endedAt: atSecond(unchanged).now }, atMinute(71));
      expect(await fake.updatesDuring(linked.page, () => cronAt(atMinute(71)))).toEqual([]);

      await editSession(session, recorded.id, { endedAt: atSecond(end).now }, atMinute(72));
      const update = onlyCall(await fake.updatesDuring(linked.page, () => cronAt(atMinute(72))));
      expect(pagePropertiesOf(update)).toMatchObject({ [column]: value });
    },
  );

  it("10.2. у базы с двумя форматами текст и число могут вызывать запись независимо", async () => {
    await fake.notion.connect(session, undefined, SETUP_TIME);
    const dataSource = fake.workspace.dataSource();
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeProperties: true },
      SETUP_TIME,
    );
    const spent = trackerPropertyId(dataSource, "spent");
    const spentHours = trackerPropertyId(dataSource, "spentHours");
    await updateDatabase(
      session,
      database.id,
      { timeFields: { spent: useColumn(spent), spentHours: useColumn(spentHours) } },
      SETUP_TIME,
    );
    const { task, page } = await linkedTask(
      fake,
      session,
      { database, dataSource },
      { title: "Отчёт" },
    );
    const recorded = await addSession(
      session,
      task.id,
      { startedAt: atSecond(0).now, endedAt: atSecond(3599).now },
      atMinute(70),
    );
    await cronAt(atMinute(70));
    expect(page.values.get(spent)).toMatchObject(richTextValue("59 мин"));
    expect(page.values.get(spentHours)).toMatchObject({ number: 1 });

    await editSession(session, recorded.id, { endedAt: atSecond(3600).now }, atMinute(71));
    const textUpdate = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(71))));
    expect(pagePropertiesOf(textUpdate)).toMatchObject({ [spent]: richTextValue("1 ч") });
    expect(page.values.get(spentHours)).toMatchObject({ number: 1 });

    await editSession(session, recorded.id, { endedAt: atSecond(3620).now }, atMinute(72));
    const numberUpdate = onlyCall(await fake.updatesDuring(page, () => cronAt(atMinute(72))));
    expect(pagePropertiesOf(numberUpdate)).toMatchObject({ [spentHours]: { number: 1.01 } });
    expect(page.values.get(spent)).toMatchObject(richTextValue("1 ч"));
  });

  it("10.3. смена назначения записывает прежние 5 часов в другую колонку", async () => {
    await fake.notion.connect(session, undefined, SETUP_TIME);
    const dataSource = fake.workspace.dataSource({
      properties: [
        { name: HOURS, type: "number" },
        { name: "Трудозатраты", type: "number" },
      ],
    });
    const original = fake.workspace.property(dataSource, HOURS).id;
    const replacement = fake.workspace.property(dataSource, "Трудозатраты").id;
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeFields: { spentHours: useColumn(original) } },
      SETUP_TIME,
    );
    const linked = await linkedTask(
      fake,
      session,
      { database, dataSource },
      {
        title: "Отчёт",
        values: { [replacement]: { number: 17 } },
      },
    );
    await addTime(linked, 1, 301, 310);
    await cronAt(atMinute(310));
    expect(linked.page.values.get(original)).toMatchObject({ number: 5 });
    expect(linked.page.values.get(replacement)).toMatchObject({ number: 17 });

    await updateDatabase(
      session,
      database.id,
      { timeFields: { spentHours: useColumn(replacement) } },
      atMinute(311),
    );
    const update = onlyCall(await fake.updatesDuring(linked.page, () => cronAt(atMinute(312))));
    expect(pagePropertiesOf(update)).toMatchObject({ [replacement]: { number: 5 } });
    expect(pagePropertiesOf(update)).not.toHaveProperty(original);
  });

  it("10.4. название, проект и журнал обновляются при прежнем значении флажка", async () => {
    await fake.notion.connect(session, undefined, SETUP_TIME);
    const blocks = fakeNotionBlocks(fake.pages);
    const dataSource = fake.workspace.dataSource({
      properties: [{ name: RUNNING, type: "checkbox" }],
    });
    const running = fake.workspace.property(dataSource, RUNNING).id;
    const database = await addDatabase(
      session,
      dataSource,
      { projectMode: "own", blockPosition: "start", timeFields: { running: useColumn(running) } },
      SETUP_TIME,
    );
    const linked = await linkedTask(fake, session, { database, dataSource }, { title: "Отчёт" });
    const { task, page } = linked;
    const project = await createProject(session, { name: "Работа" }, SETUP_TIME);
    const recorded = await addTime(linked, 1, 61, 70);
    await cronAt(atMinute(70));
    expect(page.values.get(running)).toMatchObject({ checkbox: false });

    await updateTask(session, task.id, { title: "Черновик" }, atMinute(71));
    await cronAt(atMinute(71));
    expect(page.values.get(titlePropertyId(dataSource))).toMatchObject(titleValue("Черновик"));

    await updateTask(session, task.id, { projectId: project.id }, atMinute(72));
    await cronAt(atMinute(72));
    expect(page.values.get(trackerPropertyId(dataSource, "project"))).toMatchObject({
      select: { name: "Работа" },
    });

    const note = "Сверил отчёт";
    expect(lineTexts(blocks.timeBlockOn(page))).toEqual([expect.not.stringContaining(note)]);
    await editSession(session, recorded.id, { note }, atMinute(73));
    await cronAt(atMinute(73));
    expect(lineTexts(blocks.timeBlockOn(page))).toEqual([expect.stringContaining(note)]);
    expect(page.values.get(running)).toMatchObject({ checkbox: false });
  });
});
