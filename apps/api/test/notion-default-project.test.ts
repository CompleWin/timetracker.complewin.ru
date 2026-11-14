import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCall } from "./harness/index.ts";
import { atMinute } from "./harness/clock.ts";
import { addSession } from "./harness/manual-sessions.ts";
import { TIME_FIELDS } from "./harness/notion-databases.ts";
import {
  IMPORT_RUN,
  TASKS_TITLE,
  onlyProjectNamed,
  pageIn,
  projectOfPage,
  taskOfPage,
} from "./harness/notion-import.ts";
import type { FakePage, PageValue } from "./harness/notion-pages.ts";
import {
  fakeNotionPull,
  linkPage,
  multiSelectValue,
  optionsProperty,
  selectValue,
  sendsProperty,
  userWithDatabase,
  type FakeNotionPull,
  type NotionOption,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import {
  SETUP_TIME,
  TASK_TITLE,
  cronAt,
  pagePropertiesOf,
  propertyNamed,
  trackerPropertyId,
  type DatabaseSetup,
  type SyncedTask,
} from "./harness/notion-sync.ts";
import type { FakeDataSource } from "./harness/notion-workspace.ts";
import { onlyCall } from "./harness/notion.ts";
import { createProject, updateProject, type TestProject } from "./harness/projects.ts";
import { updateTask } from "./harness/tasks.ts";

const AREA = "Сфера";
const SPORT: NotionOption = { name: "Спорт", color: "green" };
const SFEDU = "SFEDU";
const RENAMED = "Работа";

const EDITED_IN_NOTION = 11;
const FIRST_PUSH = 12;
const CHANGED_AFTER_PUSH = 13;
const CHANGED_AGAIN = 14;
const PULL_RUN = 15;
const AFTER_PULL = 16;

type ProjectField = {
  database: DatabaseSetup;
  idIn(dataSource: FakeDataSource): string;
  holding(names: string[]): PageValue;
  sent(names: string[]): PageValue;
};

type FieldTask = UserWithDatabase & {
  fieldId: string;
  field: ProjectField;
  page: FakePage;
  task: SyncedTask;
  sport: TestProject;
};

function singleSelectHolding([name]: string[]): PageValue {
  return selectValue(name === undefined ? null : { name, color: "default" });
}

function singleSelectSent([name]: string[]): PageValue {
  return { select: { name } };
}

const SELECT_FIELD: ProjectField = {
  database: {
    title: TASKS_TITLE,
    properties: [optionsProperty(AREA, "select", [SPORT])],
    projectProperty: AREA,
  },
  idIn: (dataSource) => propertyNamed(dataSource, AREA).id,
  holding: singleSelectHolding,
  sent: singleSelectSent,
};

const MULTI_SELECT_FIELD: ProjectField = {
  database: {
    title: TASKS_TITLE,
    properties: [{ name: AREA, type: "multi_select" }],
    projectProperty: AREA,
  },
  idIn: (dataSource) => propertyNamed(dataSource, AREA).id,
  holding: multiSelectValue,
  sent: (names) => ({ multi_select: names.map((name) => ({ name })) }),
};

const OWN_FIELD: ProjectField = {
  database: { title: TASKS_TITLE },
  idIn: (dataSource) => trackerPropertyId(dataSource, "project"),
  holding: singleSelectHolding,
  sent: singleSelectSent,
};

const ALL_FIELDS: [string, ProjectField][] = [
  ["property с select", SELECT_FIELD],
  ["property с multi_select", MULTI_SELECT_FIELD],
  ["own", OWN_FIELD],
];

const SINGLE_VALUE_FIELDS: [string, ProjectField][] = [
  ["property с select", SELECT_FIELD],
  ["own", OWN_FIELD],
];

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function userWithField(
  field: ProjectField,
): Promise<UserWithDatabase & { fieldId: string; sport: TestProject }> {
  const user = await userWithDatabase(fake, field.database);
  const sport = await createProject(user.session, SPORT, SETUP_TIME);
  return { ...user, sport, fieldId: field.idIn(user.added.dataSource) };
}

async function importedTask(field: ProjectField, names: string[] = []): Promise<FieldTask> {
  const user = await userWithField(field);
  const page = pageIn(fake, user.added, TASK_TITLE, { [user.fieldId]: field.holding(names) });
  await cronAt(IMPORT_RUN);
  return { ...user, field, page, task: await taskOfPage(user.session, page, IMPORT_RUN) };
}

async function linkedTask(field: ProjectField): Promise<FieldTask> {
  const user = await userWithField(field);
  const values = { [user.fieldId]: field.holding([]) };
  const page = pageIn(fake, user.added, TASK_TITLE, values, SETUP_TIME);
  const task = await linkPage(user.session, page.id, {}, SETUP_TIME);
  return { ...user, field, page, task };
}

function recordSession({ session, task }: FieldTask, minute: number): Promise<unknown> {
  return addSession(
    session,
    task.id,
    { startedAt: atMinute(minute - 2).now, endedAt: atMinute(minute - 1).now },
    atMinute(minute),
  );
}

function cronAtMinute(minute: number): Promise<void> {
  return cronAt(atMinute(minute));
}

function setInNotion(user: FieldTask, names: string[], minute: number): void {
  fake.editInNotion(user.page, {
    values: { [user.fieldId]: user.field.holding(names) },
    editedAt: atMinute(minute),
  });
}

function moveInTracker(user: FieldTask, projectId: string, minute: number): Promise<unknown> {
  return updateTask(user.session, user.task.id, { projectId }, atMinute(minute));
}

function defaultProjectOf(user: FieldTask): Promise<TestProject> {
  return onlyProjectNamed(user.session, TASKS_TITLE, atMinute(FIRST_PUSH));
}

function sendsProject(user: FieldTask): (call: ExternalCall) => boolean {
  return (call) => sendsProperty(call, user.fieldId);
}

async function onlyUpdateDuringCron(user: FieldTask, minute: number): Promise<ExternalCall> {
  return onlyCall(await fake.updatesDuring(user.page, () => cronAtMinute(minute)));
}

async function projectUpdatesDuring(
  user: FieldTask,
  action: () => Promise<unknown>,
): Promise<ExternalCall[]> {
  return (await fake.updatesDuring(user.page, action)).filter(sendsProject(user));
}

async function pushedTask(field: ProjectField): Promise<FieldTask> {
  const user = await importedTask(field);
  await recordSession(user, FIRST_PUSH);
  await cronAtMinute(FIRST_PUSH);
  return user;
}

async function movedToSport(field: ProjectField): Promise<FieldTask> {
  const user = await pushedTask(field);
  await moveInTracker(user, user.sport.id, CHANGED_AFTER_PUSH);
  return user;
}

async function sportSetAfterImport(field: ProjectField): Promise<FieldTask> {
  const user = await importedTask(field);
  setInNotion(user, [SPORT.name], EDITED_IN_NOTION);
  await recordSession(user, FIRST_PUSH);
  return user;
}

describe("задача на проекте по умолчанию после импорта", () => {
  it.each(ALL_FIELDS)(
    "1. режим %s: запись с пустым полем и сессией, cron отправляет PATCH страницы с полями времени без поля проекта",
    async (_, field) => {
      const user = await importedTask(field);
      await recordSession(user, FIRST_PUSH);
      const update = await onlyUpdateDuringCron(user, FIRST_PUSH);
      const timeFieldIds = TIME_FIELDS.map((name) =>
        trackerPropertyId(user.added.dataSource, name),
      );

      expect(sendsProperty(update, user.fieldId)).toBe(false);
      expect(Object.keys(pagePropertiesOf(update))).toEqual(expect.arrayContaining(timeFieldIds));
    },
  );
});

describe("задача на проекте по умолчанию после link", () => {
  it.each(ALL_FIELDS)(
    "2. режим %s: link без projectId страницы с пустым полем, сессия и cron отправляют PATCH страницы без поля проекта",
    async (_, field) => {
      const user = await linkedTask(field);
      await recordSession(user, FIRST_PUSH);
      const update = await onlyUpdateDuringCron(user, FIRST_PUSH);

      expect(sendsProperty(update, user.fieldId)).toBe(false);
    },
  );
});

describe("значение поставлено в Notion после импорта", () => {
  it.each(ALL_FIELDS)(
    "3. режим %s: cron до следующего pull отправляет PATCH страницы без поля проекта",
    async (_, field) => {
      const user = await sportSetAfterImport(field);
      const update = await onlyUpdateDuringCron(user, FIRST_PUSH);

      expect(sendsProperty(update, user.fieldId)).toBe(false);
    },
  );

  it.each(ALL_FIELDS)(
    "3. режим %s: cron с pull переносит задачу в проект «Спорт», поле в Notion остаётся «Спорт»",
    async (_, field) => {
      const user = await sportSetAfterImport(field);
      await cronAtMinute(FIRST_PUSH);
      await cronAtMinute(PULL_RUN);

      expect(await projectOfPage(user.session, user.page, atMinute(PULL_RUN))).toMatchObject({
        id: user.sport.id,
      });
      expect(user.page.values.get(user.fieldId)).toMatchObject(field.sent([SPORT.name]));
    },
  );
});

describe("поле очищено в Notion", () => {
  it.each(ALL_FIELDS)(
    "4. режим %s: pull вернул задачу из «Спорт» в проект по умолчанию, после сессии и cron PATCH страницы без поля проекта",
    async (_, field) => {
      const user = await importedTask(field, [SPORT.name]);
      setInNotion(user, [], EDITED_IN_NOTION);
      await cronAtMinute(PULL_RUN);
      await recordSession(user, AFTER_PULL);
      const update = await onlyUpdateDuringCron(user, AFTER_PULL);

      expect(sendsProperty(update, user.fieldId)).toBe(false);
    },
  );
});

describe("переименование проекта по умолчанию", () => {
  it.each(ALL_FIELDS)(
    "5. режим %s: задача с прошедшим push, проект по умолчанию переименован, cron не отправляет поле проекта",
    async (_, field) => {
      const user = await pushedTask(field);
      const defaultProject = await defaultProjectOf(user);
      const renamedAt = atMinute(CHANGED_AFTER_PUSH);
      await updateProject(user.session, defaultProject.id, { name: RENAMED }, renamedAt);

      expect(await projectUpdatesDuring(user, () => cronAt(renamedAt))).toEqual([]);
    },
  );
});

describe("проект сменён в трекере", () => {
  it.each(ALL_FIELDS)(
    "6. режим %s: задачу перенесли в «Спорт», cron пишет «Спорт» в поле",
    async (_, field) => {
      const user = await movedToSport(field);
      const update = await onlyUpdateDuringCron(user, CHANGED_AFTER_PUSH);

      expect(pagePropertiesOf(update)).toMatchObject({
        [user.fieldId]: field.sent([SPORT.name]),
      });
    },
  );

  it.each(SINGLE_VALUE_FIELDS)(
    "7. режим %s: задачу вернули из «Спорт» в проект по умолчанию, cron заменяет «Спорт» названием проекта по умолчанию",
    async (_, field) => {
      const user = await movedToSport(field);
      await cronAtMinute(CHANGED_AFTER_PUSH);
      await moveInTracker(user, (await defaultProjectOf(user)).id, CHANGED_AGAIN);
      const update = await onlyUpdateDuringCron(user, CHANGED_AGAIN);

      expect(pagePropertiesOf(update)).toMatchObject({
        [user.fieldId]: field.sent([TASKS_TITLE]),
      });
    },
  );

  it("7. режим property с multi_select: при значениях [SFEDU, Спорт] задачу вернули в проект по умолчанию, cron пишет [SFEDU, Tasks]", async () => {
    const user = await movedToSport(MULTI_SELECT_FIELD);
    await cronAtMinute(CHANGED_AFTER_PUSH);
    setInNotion(user, [SFEDU, SPORT.name], CHANGED_AGAIN);
    await cronAtMinute(PULL_RUN);
    await moveInTracker(user, (await defaultProjectOf(user)).id, AFTER_PULL);
    const update = await onlyUpdateDuringCron(user, AFTER_PULL);

    expect(pagePropertiesOf(update)).toMatchObject({
      [user.fieldId]: MULTI_SELECT_FIELD.sent([SFEDU, TASKS_TITLE]),
    });
  });
});

describe("проект принят из Notion", () => {
  it.each(ALL_FIELDS)(
    "8. режим %s: значение «Спорт» поставлено в Notion, pull перенёс задачу, следующий cron не отправляет поле проекта",
    async (_, field) => {
      const user = await pushedTask(field);
      setInNotion(user, [SPORT.name], CHANGED_AFTER_PUSH);
      const updates = await projectUpdatesDuring(user, async () => {
        await cronAtMinute(PULL_RUN);
        await recordSession(user, AFTER_PULL);
        await cronAtMinute(AFTER_PULL);
      });

      expect(await projectOfPage(user.session, user.page, atMinute(AFTER_PULL))).toMatchObject({
        id: user.sport.id,
      });
      expect(updates).toEqual([]);
    },
  );
});
