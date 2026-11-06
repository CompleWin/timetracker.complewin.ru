import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCall } from "./harness/index.ts";
import { atClock, atMinute } from "./harness/clock.ts";
import type { PageValue } from "./harness/notion-pages.ts";
import {
  fakeNotionPull,
  multiSelectValue,
  optionsProperty,
  projectOfTask,
  selectValue,
  sendsProperty,
  type FakeNotionPull,
  type NotionOption,
} from "./harness/notion-pull.ts";
import {
  SETUP_TIME,
  TASKS_DATABASE,
  TASK_TITLE,
  cronAt,
  loginForSync,
  pagePropertiesOf,
  propertyNamed,
  readTask,
  type DatabaseSetup,
  type UserWithTaskPage,
} from "./harness/notion-sync.ts";
import type { FakeProperty } from "./harness/notion-workspace.ts";
import { onlyCall } from "./harness/notion.ts";
import { createProject, type TestProject } from "./harness/projects.ts";
import { createTask, updateTask } from "./harness/tasks.ts";

const AREA = "Сфера";
const SPORT: NotionOption = { name: "Спорт", color: "green" };
const STUDY: NotionOption = { name: "Учёба", color: "blue" };
const WORK: NotionOption = { name: "Работа", color: "orange" };
const PULL_RUN = atMinute(10);
const NEXT_RUN = atMinute(20);
const CONFLICT_RUN = atClock("12:10");
const BY_SELECT: DatabaseSetup = {
  ...TASKS_DATABASE,
  properties: [optionsProperty(AREA, "select", [SPORT, STUDY, WORK])],
  projectProperty: AREA,
};
const BY_MULTI_SELECT: DatabaseSetup = {
  ...TASKS_DATABASE,
  properties: [{ name: AREA, type: "multi_select" }],
  projectProperty: AREA,
};

type SportTask = UserWithTaskPage & {
  area: FakeProperty;
};

type ProjectConflict = {
  user: SportTask;
  work: TestProject;
  study: TestProject;
  updates: ExternalCall[];
};

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function sportTaskWithPage(database: DatabaseSetup): Promise<SportTask> {
  const session = await loginForSync();
  const { tasks } = await fake.connectNotion(session, { databases: { tasks: database } });
  const sport = await createProject(session, SPORT, SETUP_TIME);
  const task = await createTask(session, { title: TASK_TITLE, projectId: sport.id }, SETUP_TIME);
  await cronAt(SETUP_TIME);
  const page = await fake.pageOfTask(session, task.id);
  return { session, tasks, task, page, area: propertyNamed(tasks.dataSource, AREA) };
}

function setAreaInNotion(user: SportTask, value: PageValue, editedAt: { now: string }): void {
  fake.editInNotion(user.page, { values: { [user.area.id]: value }, editedAt });
}

async function projectIdAfterPull(user: SportTask): Promise<string | null> {
  await cronAt(PULL_RUN);
  return (await readTask(user.session, user.task.id, PULL_RUN)).projectId;
}

async function projectConflict(trackerAt: string, notionAt: string): Promise<ProjectConflict> {
  const user = await sportTaskWithPage(BY_SELECT);
  const work = await createProject(user.session, WORK, SETUP_TIME);
  const study = await createProject(user.session, STUDY, SETUP_TIME);
  await updateTask(user.session, user.task.id, { projectId: work.id }, atClock(trackerAt));
  setAreaInNotion(user, selectValue(STUDY), atClock(notionAt));
  const updates = await fake.updatesDuring(user.page, () => cronAt(CONFLICT_RUN));
  return { user, work, study, updates };
}

describe("проект из select-поля", () => {
  it("18. значение сменилось со «Спорт» на «Учёба», в трекере проект не менялся: после cron задача в созданном проекте «Учёба»", async () => {
    const user = await sportTaskWithPage(BY_SELECT);
    setAreaInNotion(user, selectValue(STUDY), PULL_RUN);
    await cronAt(PULL_RUN);

    expect(await projectOfTask(user.session, user.task.id, PULL_RUN)).toMatchObject({
      name: STUDY.name,
      color: STUDY.color,
    });
  });

  it("18. принятый из Notion проект ни этот, ни следующий cron обратно не отправляют", async () => {
    const user = await sportTaskWithPage(BY_SELECT);
    setAreaInNotion(user, selectValue(STUDY), PULL_RUN);
    const updates = await fake.updatesDuring(user.page, async () => {
      await cronAt(PULL_RUN);
      await cronAt(NEXT_RUN);
    });

    expect(updates.filter((call) => sendsProperty(call, user.area.id))).toEqual([]);
  });

  it("18. пустое значение: задача переносится в проект с названием базы", async () => {
    const user = await sportTaskWithPage(BY_SELECT);
    setAreaInNotion(user, selectValue(null), PULL_RUN);
    await cronAt(PULL_RUN);

    expect(await projectOfTask(user.session, user.task.id, PULL_RUN)).toMatchObject({
      name: TASKS_DATABASE.title,
    });
  });
});

describe("проект из multi_select-поля", () => {
  it("19. последнее отправленное «Спорт», значения [SFEDU, Спорт]: проект не меняется", async () => {
    const user = await sportTaskWithPage(BY_MULTI_SELECT);
    await createProject(user.session, STUDY, SETUP_TIME);
    setAreaInNotion(user, multiSelectValue(["SFEDU", SPORT.name]), PULL_RUN);

    expect(await projectIdAfterPull(user)).toBe(user.task.projectId);
  });

  it("19. последнее отправленное «Спорт», проект «Учёба» существует, значения [SFEDU, Учёба]: задача переносится в «Учёба»", async () => {
    const user = await sportTaskWithPage(BY_MULTI_SELECT);
    const study = await createProject(user.session, STUDY, SETUP_TIME);
    setAreaInNotion(user, multiSelectValue(["SFEDU", STUDY.name]), PULL_RUN);

    expect(await projectIdAfterPull(user)).toBe(study.id);
  });
});

describe("конфликт проекта", () => {
  it("20. проект сменили в трекере в 12:00, а last_edited_time страницы с другим значением 12:05: побеждает Notion", async () => {
    const { user, study } = await projectConflict("12:00", "12:05");

    expect(await readTask(user.session, user.task.id, CONFLICT_RUN)).toMatchObject({
      projectId: study.id,
    });
  });

  it("20. проект сменили в трекере в 12:05, а last_edited_time страницы 12:00: побеждает трекер, push отправляет его проект", async () => {
    const { user, work, updates } = await projectConflict("12:05", "12:00");

    expect(await readTask(user.session, user.task.id, CONFLICT_RUN)).toMatchObject({
      projectId: work.id,
    });
    expect(pagePropertiesOf(onlyCall(updates))).toMatchObject({
      [user.area.id]: { select: { name: WORK.name } },
    });
  });
});
