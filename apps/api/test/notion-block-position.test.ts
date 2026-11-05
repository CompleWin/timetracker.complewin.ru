import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import { atClock } from "./harness/clock.ts";
import { lineTexts } from "./harness/notion-blocks.ts";
import { updateDatabase, type BlockPosition } from "./harness/notion-databases.ts";
import type { FakePage } from "./harness/notion-pages.ts";
import {
  FUN_DATABASE,
  SETUP_TIME,
  TASKS_DATABASE,
  cronAt,
  loginForSync,
  syncStatus,
  type SyncedDatabase,
} from "./harness/notion-sync.ts";
import {
  FIRST_LINE,
  FIRST_SESSION,
  NEXT_RUN,
  fakeNotionTimeBlocks,
  requestBlockPosition,
  setBlockPosition,
  userWithSessionLog,
  type FakeNotionTimeBlocks,
} from "./harness/notion-time-block.ts";
import { jsonBodyOf, onlyCall } from "./harness/notion.ts";
import { createProject } from "./harness/projects.ts";
import { createTask, type TestTask } from "./harness/tasks.ts";

const DATABASE_CHANGE = atClock("01:00");

type UserWithTwoDatabases = {
  session: TestSession;
  tasks: SyncedDatabase;
  createTaskIn(database: "tasks" | "fun", title: string): Promise<TestTask>;
};

let fake: FakeNotionTimeBlocks;

beforeEach(() => {
  fake = fakeNotionTimeBlocks();
});

async function userWithTwoDatabases(
  tasksPosition: BlockPosition,
  funPosition: BlockPosition,
): Promise<UserWithTwoDatabases> {
  const session = await loginForSync();
  const { tasks, fun } = await fake.sync.connectNotion(session, {
    databases: {
      tasks: { ...TASKS_DATABASE, blockPosition: tasksPosition },
      fun: { ...FUN_DATABASE, blockPosition: funPosition },
    },
  });
  const games = await createProject(
    session,
    { name: "Игры", notionDatabaseId: fun.database.id },
    SETUP_TIME,
  );
  const projectIds = { tasks: null, fun: games.id };
  return {
    session,
    tasks,
    createTaskIn: (database, title) =>
      createTask(session, { title, projectId: projectIds[database] }, SETUP_TIME),
  };
}

function pageOf(session: TestSession, task: TestTask): Promise<FakePage> {
  return fake.sync.pageOfTask(session, task.id);
}

describe("своё положение блока у задачи", () => {
  it("11. notionBlockPosition = end у задачи с блоком в начале: 200 { task }, затем DELETE старого callout и создание нового с position end", async () => {
    const user = await userWithSessionLog(fake.sync, [FIRST_SESSION]);
    const before = fake.blocks.timeBlockOn(user.page);

    expect(await requestBlockPosition(user.session, user.task.id, "end", NEXT_RUN)).toMatchObject({
      status: 200,
      body: { task: { id: user.task.id, notionBlockPosition: "end" } },
    });

    const run = await fake.blocks.callsDuring(() => cronAt(NEXT_RUN));
    const after = fake.blocks.timeBlockOn(user.page);

    onlyCall(run.deletions(before.callout));
    expect(jsonBodyOf(onlyCall(run.appends(user.page.id)))).toMatchObject({
      position: { type: "end" },
    });
    expect(after.callout.id).not.toBe(before.callout.id);
    expect(lineTexts(after)).toEqual([FIRST_LINE]);
  });

  it("12. notionBlockPosition = none: DELETE callout, других запросов к блокам нет", async () => {
    const user = await userWithSessionLog(fake.sync, [FIRST_SESSION]);
    const { callout } = fake.blocks.timeBlockOn(user.page);
    await setBlockPosition(user.session, user.task.id, "none", NEXT_RUN);
    const run = await fake.blocks.callsDuring(() => cronAt(NEXT_RUN));

    expect(run.all).toEqual([onlyCall(run.deletions(callout))]);
    expect(fake.blocks.calloutsOn(user.page)).toEqual([]);
  });
});

describe("положение блока из настроек базы", () => {
  it("13. PATCH /api/notion/databases/:id с новым blockPosition ставит в очередь задачи этой базы без своего значения, остальные не трогает", async () => {
    const { session, tasks, createTaskIn } = await userWithTwoDatabases("none", "none");
    const inherited = await createTaskIn("tasks", "Отчёт");
    const ownPosition = await createTaskIn("tasks", "Созвон");
    const otherDatabase = await createTaskIn("fun", "Ведьмак");
    await setBlockPosition(session, ownPosition.id, "none", SETUP_TIME);
    await cronAt(SETUP_TIME);
    await updateDatabase(session, tasks.database.id, { blockPosition: "start" }, DATABASE_CHANGE);

    expect(await syncStatus(session, DATABASE_CHANGE)).toMatchObject({ pendingTasks: 1 });

    const run = await fake.blocks.callsDuring(() => cronAt(DATABASE_CHANGE));
    const inheritedPage = await pageOf(session, inherited);

    expect(jsonBodyOf(onlyCall(run.appends(inheritedPage.id)))).toMatchObject({
      position: { type: "start" },
    });
    expect(run.appends((await pageOf(session, ownPosition)).id)).toEqual([]);
    expect(run.appends((await pageOf(session, otherDatabase)).id)).toEqual([]);
  });

  it("14. «Задачи» со start и «Развлечения» с none: задача из «Развлечений» блок не получает, задача из «Задач» получает", async () => {
    const { session, createTaskIn } = await userWithTwoDatabases("start", "none");
    const report = await createTaskIn("tasks", "Отчёт");
    const witcher = await createTaskIn("fun", "Ведьмак");
    await cronAt(SETUP_TIME);
    const witcherPage = await pageOf(session, witcher);

    expect(fake.blocks.calloutsOn(await pageOf(session, report))).toHaveLength(1);
    expect(fake.blocks.calloutsOn(witcherPage)).toEqual([]);
    expect(fake.blocks.calls().appends(witcherPage.id)).toEqual([]);
  });
});
