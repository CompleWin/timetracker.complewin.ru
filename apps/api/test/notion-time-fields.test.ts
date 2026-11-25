import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/api.ts";
import { expectApiError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import { addSession } from "./harness/manual-sessions.ts";
import { fakeNotionBlocks, lineTexts } from "./harness/notion-blocks.ts";
import {
  addDatabase,
  connectedDatabases,
  databaseBody,
  listAvailableProperties,
  patchDatabase,
  postDatabase,
  updateDatabase,
} from "./harness/notion-databases.ts";
import {
  SETUP_TIME,
  cronAt,
  fakeNotionSync,
  loginForSync,
  richTextValue,
  trackerPropertyId,
  type FakeNotionSync,
} from "./harness/notion-sync.ts";
import { linkedTask } from "./harness/notion-task-pages.ts";
import { createProject } from "./harness/projects.ts";
import { updateTask } from "./harness/tasks.ts";

const MANUAL_SETTINGS = { projectMode: "none", blockPosition: "none" } as const;
const HOURS = "Часы";
const TIME = "Время";
const RUNNING = "Активна";
const LAST_TRACKED = "Начало";

let fake: FakeNotionSync;
let session: TestSession;

beforeEach(async () => {
  fake = fakeNotionSync();
  session = await loginForSync();
  await fake.notion.connect(session, undefined, SETUP_TIME);
});

function useColumn(propertyId: string) {
  return { mode: "existing", propertyId } as const;
}

function createColumn(name: string) {
  return { mode: "create", name } as const;
}

describe("настройки полей времени Notion", () => {
  it("1. ручное добавление сохраняет отдельные наборы полей для каждой базы", async () => {
    const work = fake.workspace.dataSource({
      title: ["Работа"],
      properties: [
        { name: HOURS, type: "number" },
        { name: RUNNING, type: "checkbox" },
        { name: LAST_TRACKED, type: "date" },
      ],
    });
    const personal = fake.workspace.dataSource({ title: ["Личное"] });
    const spentHours = fake.workspace.property(work, HOURS).id;
    const running = fake.workspace.property(work, RUNNING).id;
    const lastTracked = fake.workspace.property(work, LAST_TRACKED).id;
    const workDatabase = await addDatabase(
      session,
      work,
      {
        ...MANUAL_SETTINGS,
        timeFields: {
          spentHours: useColumn(spentHours),
          running: useColumn(running),
          lastTracked: useColumn(lastTracked),
        },
      },
      SETUP_TIME,
    );
    const personalDatabase = await addDatabase(
      session,
      personal,
      { ...MANUAL_SETTINGS, timeFields: {} },
      SETUP_TIME,
    );

    await updateDatabase(session, workDatabase.id, { blockPosition: "end" }, SETUP_TIME);

    const saved = await connectedDatabases(session, SETUP_TIME);
    const savedWork = saved.find((database) => database.id === workDatabase.id);
    const savedPersonal = saved.find((database) => database.id === personalDatabase.id);
    expect(workDatabase.timeFields).toEqual({ spentHours, running, lastTracked });
    expect(savedWork).toMatchObject({ timeProperties: true, blockPosition: "end" });
    expect(savedWork?.timeFields).toEqual({ spentHours, running, lastTracked });
    expect(savedPersonal).toMatchObject({ timeProperties: false });
    expect(savedPersonal?.timeFields).toEqual({});
    expect(fake.workspace.schemaUpdates(personal)).toEqual([]);
  });

  it("1. POST отклоняет назначение обоих форматов длительности", async () => {
    const dataSource = fake.workspace.dataSource({
      properties: [{ name: HOURS, type: "number" }],
    });
    const hours = fake.workspace.property(dataSource, HOURS).id;
    const timeFields = { spentHours: useColumn(hours), spent: createColumn(TIME) };
    const response = await postDatabase(
      session,
      databaseBody(dataSource, { ...MANUAL_SETTINGS, timeFields }),
      SETUP_TIME,
    );
    expectApiError(response, "validation_error");
    expect(await connectedDatabases(session, SETUP_TIME)).toEqual([]);
    expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
  });

  it("1. PATCH не добавляет второй формат к одному сохранённому", async () => {
    const dataSource = fake.workspace.dataSource({
      properties: [{ name: HOURS, type: "number" }],
    });
    const hours = fake.workspace.property(dataSource, HOURS).id;
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeFields: { spentHours: useColumn(hours) } },
      SETUP_TIME,
    );
    expectApiError(
      await patchDatabase(
        session,
        database.id,
        { timeFields: { spentHours: useColumn(hours), spent: createColumn(TIME) } },
        SETUP_TIME,
      ),
      "validation_error",
    );
    const [saved] = await connectedDatabases(session, SETUP_TIME);
    expect(saved).toMatchObject({ id: database.id });
    expect(saved?.timeFields).toEqual({ spentHours: hours });
    expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
  });

  it("6. PATCH с двумя сохранёнными форматами не позволяет заменить одну из колонок", async () => {
    const dataSource = fake.workspace.dataSource({ properties: [{ name: HOURS, type: "number" }] });
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeProperties: true },
      SETUP_TIME,
    );
    const spent = trackerPropertyId(dataSource, "spent");
    const differentHours = fake.workspace.property(dataSource, HOURS).id;
    expectApiError(
      await patchDatabase(
        session,
        database.id,
        { timeFields: { spentHours: useColumn(differentHours), spent: useColumn(spent) } },
        SETUP_TIME,
      ),
      "validation_error",
    );
    const [saved] = await connectedDatabases(session, SETUP_TIME);
    expect(saved).toMatchObject({ id: database.id });
    expect(saved?.timeFields).toEqual(database.timeFields);
  });

  it("2. создаётся только выбранная колонка Время и получает текстовую длительность", async () => {
    const dataSource = fake.workspace.dataSource();
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeFields: { spent: createColumn(TIME) } },
      SETUP_TIME,
    );
    const duration = fake.workspace.property(dataSource, TIME);
    expect(dataSource.properties.filter(({ type }) => type !== "title")).toMatchObject([
      { name: TIME, type: "rich_text" },
    ]);
    expect(database.timeFields).toEqual({ spent: duration.id });

    const { task, page } = await linkedTask(
      fake,
      session,
      { database, dataSource },
      { title: "Отчёт" },
    );
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(1).now, endedAt: atMinute(151).now },
      atMinute(160),
    );
    await cronAt(atMinute(160));

    expect(page.values.get(duration.id)).toMatchObject(richTextValue("2 ч 30 мин"));
  });

  it("3. колонки доступны по имени и типу, поля можно одновременно выбрать и создать", async () => {
    const dataSource = fake.workspace.dataSource({
      properties: [
        { name: "Направление", type: "select" },
        { name: HOURS, type: "number" },
        { name: "Оценка", type: "number" },
        { name: RUNNING, type: "checkbox" },
        { name: LAST_TRACKED, type: "date" },
        { name: "Описание", type: "rich_text" },
      ],
    });
    const response = await listAvailableProperties(session, dataSource.id, SETUP_TIME);
    const direction = fake.workspace.property(dataSource, "Направление");
    expect(response).toMatchObject({
      status: 200,
      body: {
        properties: [direction],
        columns: expect.arrayContaining(
          dataSource.properties.map((column) => expect.objectContaining(column)),
        ),
      },
    });
    expect(response.body.columns).toHaveLength(dataSource.properties.length);

    const hours = fake.workspace.property(dataSource, HOURS);
    const rating = fake.workspace.property(dataSource, "Оценка");
    const originalRunning = fake.workspace.property(dataSource, RUNNING);
    const newRunningName = "Таймер отчёта";
    const initialColumnCount = dataSource.properties.length;
    const database = await addDatabase(
      session,
      dataSource,
      {
        ...MANUAL_SETTINGS,
        timeFields: { spentHours: useColumn(hours.id), running: createColumn(newRunningName) },
      },
      SETUP_TIME,
    );
    const running = fake.workspace.property(dataSource, newRunningName);
    expect(running).toMatchObject({ type: "checkbox" });
    expect(database.timeFields).toEqual({ spentHours: hours.id, running: running.id });
    expect(dataSource.properties).toHaveLength(initialColumnCount + 1);
    expect(dataSource.properties.filter(({ name }) => name === HOURS)).toMatchObject([hours]);

    const { task, page } = await linkedTask(
      fake,
      session,
      { database, dataSource },
      {
        title: "Отчёт",
        values: { [rating.id]: { number: 8 }, [originalRunning.id]: { checkbox: true } },
      },
    );
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(1).now, endedAt: atMinute(61).now },
      atMinute(70),
    );
    await cronAt(atMinute(70));

    expect(Object.fromEntries(page.values)).toMatchObject({
      [hours.id]: { number: 1 },
      [rating.id]: { number: 8 },
      [running.id]: { checkbox: false },
      [originalRunning.id]: { checkbox: true },
    });
  });

  it.each(["rich_text", "number"])(
    "4. создание с именем существующей колонки типа %s возвращает конфликт",
    async (type) => {
      const dataSource = fake.workspace.dataSource({ properties: [{ name: TIME, type }] });
      const response = await postDatabase(
        session,
        {
          ...databaseBody(dataSource, MANUAL_SETTINGS),
          timeFields: { spent: createColumn(TIME) },
        },
        SETUP_TIME,
      );

      expectApiError(response, "property_conflict");
      expect(response.body).toMatchObject({ error: { details: { name: TIME } } });
      expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
      expect(await connectedDatabases(session, SETUP_TIME)).toEqual([]);
    },
  );

  it("4. одинаковые имена двух новых колонок возвращают конфликт без добавления колонок", async () => {
    const dataSource = fake.workspace.dataSource();
    const database = await addDatabase(session, dataSource, MANUAL_SETTINGS, SETUP_TIME);
    const response = await patchDatabase(
      session,
      database.id,
      {
        timeFields: { spent: createColumn(TIME), running: createColumn(TIME) },
      },
      SETUP_TIME,
    );

    expectApiError(response, "property_conflict");
    expect(response.body).toMatchObject({ error: { details: { name: TIME } } });
    expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
    expect(await connectedDatabases(session, SETUP_TIME)).toMatchObject([
      { id: database.id, timeProperties: false },
    ]);
  });

  it("3. неверный ID и несовместимый тип существующей колонки возвращают ошибку проверки", async () => {
    const dataSource = fake.workspace.dataSource({
      properties: [{ name: TIME, type: "rich_text" }],
    });
    const incompatibleId = fake.workspace.property(dataSource, TIME).id;
    const database = await addDatabase(session, dataSource, MANUAL_SETTINGS, SETUP_TIME);
    const unknownColumn = await postDatabase(
      session,
      {
        ...databaseBody(fake.workspace.dataSource(), MANUAL_SETTINGS),
        timeFields: { spentHours: useColumn("unknown-property") },
      },
      SETUP_TIME,
    );
    const incompatibleColumn = await patchDatabase(
      session,
      database.id,
      {
        timeFields: { spentHours: useColumn(incompatibleId) },
      },
      SETUP_TIME,
    );

    expectApiError(unknownColumn, "validation_error");
    expectApiError(incompatibleColumn, "validation_error");
    expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
  });

  it("1. POST и PATCH отклоняют одновременную передачу timeFields и timeProperties", async () => {
    const dataSource = fake.workspace.dataSource();
    const settings = { timeFields: {}, timeProperties: true };
    const post = await postDatabase(
      session,
      databaseBody(dataSource, { ...MANUAL_SETTINGS, ...settings }),
      SETUP_TIME,
    );
    expectApiError(post, "validation_error");

    const database = await addDatabase(session, dataSource, MANUAL_SETTINGS, SETUP_TIME);
    expectApiError(
      await patchDatabase(session, database.id, settings, SETUP_TIME),
      "validation_error",
    );
    expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
  });
});

describe("синхронизация выбранных полей времени Notion", () => {
  it("5. ближайшая синхронизация заполняет колонку у всех связанных задач без изменений задач", async () => {
    const dataSource = fake.workspace.dataSource({ properties: [{ name: HOURS, type: "number" }] });
    const database = await addDatabase(session, dataSource, MANUAL_SETTINGS, SETUP_TIME);
    const hours = fake.workspace.property(dataSource, HOURS).id;
    const first = await linkedTask(
      fake,
      session,
      { database, dataSource },
      {
        title: "Отчёт",
        values: { [hours]: { number: 17 } },
      },
    );
    const second = await linkedTask(
      fake,
      session,
      { database, dataSource },
      {
        title: "Зачёт",
        values: { [hours]: { number: 9 } },
      },
    );
    await addSession(
      session,
      first.task.id,
      { startedAt: atMinute(1).now, endedAt: atMinute(301).now },
      atMinute(310),
    );
    await addSession(
      session,
      second.task.id,
      { startedAt: atMinute(1).now, endedAt: atMinute(121).now },
      atMinute(310),
    );
    await cronAt(atMinute(310));
    expect(first.page.values.get(hours)).toMatchObject({ number: 17 });
    expect(second.page.values.get(hours)).toMatchObject({ number: 9 });

    await updateDatabase(
      session,
      database.id,
      { timeFields: { spentHours: useColumn(hours) } },
      atMinute(311),
    );
    await cronAt(atMinute(312));

    expect(first.page.values.get(hours)).toMatchObject({ number: 5 });
    expect(second.page.values.get(hours)).toMatchObject({ number: 2 });
  });

  it("5. при выбранной колонке времени поле проекта и журнал сессий продолжают работать", async () => {
    const blocks = fakeNotionBlocks(fake.pages);
    const dataSource = fake.workspace.dataSource({ properties: [{ name: HOURS, type: "number" }] });
    const hours = fake.workspace.property(dataSource, HOURS).id;
    const database = await addDatabase(
      session,
      dataSource,
      {
        projectMode: "own",
        blockPosition: "start",
        timeFields: { spentHours: useColumn(hours) },
      },
      SETUP_TIME,
    );
    const { task, page } = await linkedTask(
      fake,
      session,
      { database, dataSource },
      { title: "Отчёт" },
    );
    const project = await createProject(session, { name: "Работа" }, atMinute(1));
    await updateTask(session, task.id, { projectId: project.id }, atMinute(2));
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(1).now, endedAt: atMinute(61).now },
      atMinute(70),
    );
    await cronAt(atMinute(70));

    expect(Object.fromEntries(page.values)).toMatchObject({
      [hours]: { number: 1 },
      [trackerPropertyId(dataSource, "project")]: { select: { name: "Работа" } },
    });
    expect(lineTexts(blocks.timeBlockOn(page))).toEqual([expect.stringContaining("1 ч")]);
  });

  it("6. отключение сохраняет колонку и значение, повторное включение записывает актуальное время", async () => {
    const dataSource = fake.workspace.dataSource({
      properties: [
        { name: HOURS, type: "number" },
        { name: LAST_TRACKED, type: "date" },
      ],
    });
    const hours = fake.workspace.property(dataSource, HOURS).id;
    const lastTracked = fake.workspace.property(dataSource, LAST_TRACKED).id;
    const database = await addDatabase(
      session,
      dataSource,
      {
        ...MANUAL_SETTINGS,
        timeFields: { spentHours: useColumn(hours), lastTracked: useColumn(lastTracked) },
      },
      SETUP_TIME,
    );
    const { task, page } = await linkedTask(
      fake,
      session,
      { database, dataSource },
      { title: "Отчёт" },
    );
    const first = await addSession(
      session,
      task.id,
      { startedAt: atMinute(1).now, endedAt: atMinute(61).now },
      atMinute(70),
    );
    await cronAt(atMinute(70));
    expect(Object.fromEntries(page.values)).toMatchObject({
      [hours]: { number: 1 },
      [lastTracked]: { date: { start: first.startedAt } },
    });

    const partial = await updateDatabase(
      session,
      database.id,
      { timeFields: { lastTracked: useColumn(lastTracked) } },
      atMinute(71),
    );
    expect(partial.timeFields).toEqual({ lastTracked });
    const second = await addSession(
      session,
      task.id,
      { startedAt: atMinute(80).now, endedAt: atMinute(140).now },
      atMinute(150),
    );
    await cronAt(atMinute(150));
    expect(Object.fromEntries(page.values)).toMatchObject({
      [hours]: { number: 1 },
      [lastTracked]: { date: { start: second.startedAt } },
    });

    const disabled = await updateDatabase(session, database.id, { timeFields: {} }, atMinute(151));
    expect(disabled.timeProperties).toBe(false);
    expect(disabled.timeFields).toEqual({});
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(160).now, endedAt: atMinute(220).now },
      atMinute(230),
    );
    await cronAt(atMinute(230));
    expect(Object.fromEntries(page.values)).toMatchObject({
      [hours]: { number: 1 },
      [lastTracked]: { date: { start: second.startedAt } },
    });

    const restored = await updateDatabase(
      session,
      database.id,
      { timeFields: { spentHours: useColumn(hours) } },
      atMinute(231),
    );
    expect(restored.timeFields).toEqual({ spentHours: hours });
    await cronAt(atMinute(232));

    expect(Object.fromEntries(page.values)).toMatchObject({
      [hours]: { number: 3 },
      [lastTracked]: { date: { start: second.startedAt } },
    });
    expect(fake.workspace.schemaUpdates(dataSource)).toEqual([]);
  });

  it("6. два сохранённых формата продолжают обновляться после изменения других настроек", async () => {
    const dataSource = fake.workspace.dataSource();
    const database = await addDatabase(
      session,
      dataSource,
      { ...MANUAL_SETTINGS, timeProperties: true },
      SETUP_TIME,
    );
    const spentHours = trackerPropertyId(dataSource, "spentHours");
    const spent = trackerPropertyId(dataSource, "spent");
    const running = trackerPropertyId(dataSource, "running");
    const lastTracked = trackerPropertyId(dataSource, "lastTracked");
    expect(database.timeFields).toEqual({ spentHours, spent, running, lastTracked });
    const { task, page } = await linkedTask(
      fake,
      session,
      { database, dataSource },
      { title: "Отчёт", values: { [running]: { checkbox: true } } },
    );

    const updatedProject = await updateDatabase(
      session,
      database.id,
      { projectMode: "own" },
      atMinute(1),
    );
    expect(updatedProject.timeFields).toEqual({ spentHours, spent, running, lastTracked });

    const timeFields = {
      spentHours: useColumn(spentHours),
      spent: useColumn(spent),
      lastTracked: useColumn(lastTracked),
    };
    const updatedTime = await updateDatabase(session, database.id, { timeFields }, atMinute(2));
    expect(updatedTime.timeFields).toEqual({ spentHours, spent, lastTracked });
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(4).now, endedAt: atMinute(64).now },
      atMinute(70),
    );
    await cronAt(atMinute(70));
    expect(Object.fromEntries(page.values)).toMatchObject({
      [spentHours]: { number: 1 },
      [spent]: richTextValue("1 ч"),
      [running]: { checkbox: true },
    });

    const singleFormat = await updateDatabase(
      session,
      database.id,
      { timeFields: { spentHours: useColumn(spentHours), lastTracked: useColumn(lastTracked) } },
      atMinute(71),
    );
    expect(singleFormat.timeFields).toEqual({ spentHours, lastTracked });
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(80).now, endedAt: atMinute(140).now },
      atMinute(150),
    );
    await cronAt(atMinute(150));
    expect(Object.fromEntries(page.values)).toMatchObject({
      [spentHours]: { number: 2 },
      [spent]: richTextValue("1 ч"),
    });
  });
});
