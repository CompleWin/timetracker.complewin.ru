import { beforeEach, describe, expect, it } from "vitest";
import { addSession, deleteSession, editSession } from "./harness/manual-sessions.ts";
import { lineTexts, textOf, type BlockCalls, type TimeBlock } from "./harness/notion-blocks.ts";
import { cronAt } from "./harness/notion-sync.ts";
import {
  FIRST_LINE,
  FIRST_SESSION,
  NEXT_RUN,
  SECOND_LINE,
  SECOND_SESSION,
  fakeNotionTimeBlocks,
  userWithSessionLog,
  type FakeNotionTimeBlocks,
  type UserWithSessionLog,
} from "./harness/notion-time-block.ts";
import { jsonBodyOf, onlyCall } from "./harness/notion.ts";
import { updateTask } from "./harness/tasks.ts";

const NOTE = "повторил карточки";
const FIRST = 0;
const SECOND = 1;

type NextRun = {
  user: UserWithSessionLog;
  before: TimeBlock;
  run: BlockCalls;
  after: TimeBlock;
};

let fake: FakeNotionTimeBlocks;

beforeEach(() => {
  fake = fakeNotionTimeBlocks();
});

async function nextRunAfter(
  user: UserWithSessionLog,
  change: (before: TimeBlock) => Promise<unknown>,
): Promise<NextRun> {
  const before = fake.blocks.timeBlockOn(user.page);
  await change(before);
  const run = await fake.blocks.callsDuring(() => cronAt(NEXT_RUN));
  return { user, before, run, after: fake.blocks.timeBlockOn(user.page) };
}

async function nextRunAfterNewSession(): Promise<NextRun> {
  const user = await userWithSessionLog(fake.sync, [FIRST_SESSION]);
  return nextRunAfter(user, () => addSession(user.session, user.task.id, SECOND_SESSION, NEXT_RUN));
}

function itemAt<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected an item at index ${index}`);
  return item;
}

describe("новая завершённая сессия", () => {
  it("3. следующий cron после новой сессии отправляет PATCH /v1/blocks/{callout} со сводкой", async () => {
    const { before, run, after } = await nextRunAfterNewSession();

    onlyCall(run.updates(before.callout));
    expect(textOf(after.callout)).toBe(
      "Всего: 1 ч 15 мин · сессий: 2 · обновлено 01.01.2030 07:00",
    );
  });

  it("3. строка новой сессии вставляется с after_block, указывающим на блок предыдущей сессии", async () => {
    const { before, run, after } = await nextRunAfterNewSession();

    expect(jsonBodyOf(onlyCall(run.appends(before.toggle.id)))).toMatchObject({
      position: { type: "after_block", after_block: { id: itemAt(before.lines, FIRST).id } },
    });
    expect(lineTexts(after)).toEqual([FIRST_LINE, SECOND_LINE]);
  });

  it("3. следующий cron после новой сессии нового callout не создаёт", async () => {
    const { user, before, run, after } = await nextRunAfterNewSession();

    expect(run.appends(user.page.id)).toEqual([]);
    expect(after.callout.id).toBe(before.callout.id);
  });

  it("4. ручная сессия раньше всех существующих вставляется с position start", async () => {
    const user = await userWithSessionLog(fake.sync, [SECOND_SESSION]);
    const { before, run, after } = await nextRunAfter(user, () =>
      addSession(user.session, user.task.id, FIRST_SESSION, NEXT_RUN),
    );

    expect(jsonBodyOf(onlyCall(run.appends(before.toggle.id)))).toMatchObject({
      position: { type: "start" },
    });
    expect(lineTexts(after)).toEqual([FIRST_LINE, SECOND_LINE]);
  });
});

describe("изменённая и удалённая сессия", () => {
  it("5. изменение заметки отправляет PATCH блока этой строки", async () => {
    const user = await userWithSessionLog(fake.sync, [FIRST_SESSION, SECOND_SESSION]);
    const { before, run, after } = await nextRunAfter(user, () =>
      editSession(user.session, itemAt(user.sessions, FIRST).id, { note: NOTE }, NEXT_RUN),
    );

    onlyCall(run.updates(itemAt(before.lines, FIRST)));
    expect(lineTexts(after)).toEqual([`${FIRST_LINE} — ${NOTE}`, SECOND_LINE]);
  });

  it("5. удаление сессии отправляет DELETE блока её строки", async () => {
    const user = await userWithSessionLog(fake.sync, [FIRST_SESSION, SECOND_SESSION]);
    const { before, run, after } = await nextRunAfter(user, () =>
      deleteSession(user.session, itemAt(user.sessions, SECOND).id, NEXT_RUN),
    );

    onlyCall(run.deletions(itemAt(before.lines, SECOND)));
    expect(lineTexts(after)).toEqual([FIRST_LINE]);
  });
});

describe("блок пропал из Notion", () => {
  it("10. PATCH callout вернул 404: в том же запуске блок создаётся заново, журнал выгружается заново", async () => {
    const user = await userWithSessionLog(fake.sync, [FIRST_SESSION]);
    const { before, run, after } = await nextRunAfter(user, async ({ callout }) => {
      fake.blocks.erase(callout);
      await updateTask(user.session, user.task.id, { title: "Anki: испанский" }, NEXT_RUN);
    });

    onlyCall(run.updates(before.callout));
    onlyCall(run.appends(user.page.id));
    expect(after.callout.id).not.toBe(before.callout.id);
    expect(lineTexts(after)).toEqual([FIRST_LINE]);
  });
});
