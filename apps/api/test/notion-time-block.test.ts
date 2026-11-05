import { beforeEach, describe, expect, it } from "vitest";
import { atClock, atMinute } from "./harness/clock.ts";
import type { SessionInterval } from "./harness/manual-sessions.ts";
import { lineTexts, richTextContents, textOf, type TimeBlock } from "./harness/notion-blocks.ts";
import type { Locale } from "./harness/notion-databases.ts";
import { SETUP_TIME, type UserWithQueuedTask } from "./harness/notion-sync.ts";
import {
  AFTER_SESSIONS,
  FIRST_LINE,
  FIRST_SESSION,
  SECOND_LINE,
  SECOND_SESSION,
  addSessions,
  fakeNotionTimeBlocks,
  moscowUserWithQueuedTask,
  withTaskPage,
  type FakeNotionTimeBlocks,
} from "./harness/notion-time-block.ts";
import { jsonBodyOf, onlyCall } from "./harness/notion.ts";
import { startTimer } from "./harness/timers.ts";

const NOTE = "повторил карточки";
const LONG_NOTE = "карточка ".repeat(500);
const NOTE_CHUNK_LENGTHS = [2000, 2000, 500];
const NIGHT_IN_MOSCOW: SessionInterval = {
  startedAt: "2026-10-31T20:30:00.000Z",
  endedAt: "2026-10-31T21:15:00.000Z",
};

let fake: FakeNotionTimeBlocks;

beforeEach(() => {
  fake = fakeNotionTimeBlocks();
});

function userWithQueuedTask(locale: Locale = "ru"): Promise<UserWithQueuedTask> {
  return moscowUserWithQueuedTask(fake.sync, locale);
}

async function timeBlockAfterCron(
  queued: UserWithQueuedTask,
  time: { now: string } = AFTER_SESSIONS,
): Promise<TimeBlock> {
  const { page } = await withTaskPage(fake.sync, queued, time);
  return fake.blocks.timeBlockOn(page);
}

describe("создание блока", () => {
  it("1. база с blockPosition start: cron отправляет PATCH /v1/blocks/{pageId}/children с position start и notifications silent", async () => {
    const { page } = await withTaskPage(fake.sync, await userWithQueuedTask());

    expect(jsonBodyOf(onlyCall(fake.blocks.calls().appends(page.id)))).toMatchObject({
      position: { type: "start" },
      notifications: { mode: "silent" },
      children: [expect.any(Object)],
    });
  });

  it("1. внутри callout с иконкой ⏱, цветом gray_background и сводкой «Всего: … · сессий: … · обновлено …», в нём toggle «Журнал сессий»", async () => {
    const { callout, toggle } = await timeBlockAfterCron(await userWithQueuedTask(), SETUP_TIME);

    expect(callout.content).toMatchObject({ icon: { emoji: "⏱" }, color: "gray_background" });
    expect(textOf(callout)).toMatch(/^Всего: .+ · сессий: \d+ · обновлено .+$/);
    expect(textOf(toggle)).toBe("Журнал сессий");
  });

  it("2. две завершённые сессии, одна с заметкой: один PATCH в toggle с двумя строками по хронологии, строка без заметки без « — »", async () => {
    const queued = await userWithQueuedTask();
    await addSessions(queued, [{ ...SECOND_SESSION, note: NOTE }, FIRST_SESSION]);
    const timeBlock = await timeBlockAfterCron(queued);
    const append = onlyCall(fake.blocks.calls().appends(timeBlock.toggle.id));

    expect(jsonBodyOf(append)).toMatchObject({
      children: [expect.any(Object), expect.any(Object)],
    });
    expect(lineTexts(timeBlock)).toEqual([FIRST_LINE, `${SECOND_LINE} — ${NOTE}`]);
    expect(lineTexts(timeBlock)[0]).not.toContain(" — ");
  });
});

describe("строка журнала", () => {
  it("6. сессия 23:30–00:15 в зоне Europe/Moscow даёт строку «31.10 23:30–01.11 00:15 · 45 мин»", async () => {
    const queued = await userWithQueuedTask();
    await addSessions(queued, [NIGHT_IN_MOSCOW], SETUP_TIME);

    expect(lineTexts(await timeBlockAfterCron(queued, SETUP_TIME))).toEqual([
      "31.10 23:30–01.11 00:15 · 45 мин",
    ]);
  });

  it("7. заметка из 4500 символов: первый кусок rich text кончается на « — », за ним заметка кусками 2000, 2000 и 500", async () => {
    const queued = await userWithQueuedTask();
    await addSessions(queued, [{ ...FIRST_SESSION, note: LONG_NOTE }]);
    const [line] = (await timeBlockAfterCron(queued)).lines;
    const [prefix, ...noteChunks] = line ? richTextContents(line) : [];

    expect(prefix).toBe(`${FIRST_LINE} — `);
    expect(noteChunks.map((chunk) => chunk.length)).toEqual(NOTE_CHUNK_LENGTHS);
    expect(noteChunks.join("")).toBe(LONG_NOTE);
  });
});

describe("сводка", () => {
  it("8. при идущем таймере сводка считает идущую сессию и заканчивается на « · ▶ идёт»", async () => {
    const queued = await userWithQueuedTask();
    await startTimer(queued.session, queued.task.id, atClock("01:00"));
    const { callout, lines } = await timeBlockAfterCron(queued, atClock("01:00"));

    expect(textOf(callout)).toContain(" · сессий: 1 · ");
    expect(textOf(callout)).toMatch(/ · ▶ идёт$/);
    expect(lines).toEqual([]);
  });

  it("9. время «обновлено» выводится в часовом поясе пользователя Europe/Moscow", async () => {
    const { callout } = await timeBlockAfterCron(await userWithQueuedTask(), atMinute(5));

    expect(textOf(callout)).toBe("Всего: 0 мин · сессий: 0 · обновлено 01.01.2030 03:05");
  });
});

describe("английский язык", () => {
  it("15. locale en: сводка начинается с «Total: », toggle «Session log», строка «Oct 31 23:30–Nov 1 00:15 · 45 min»", async () => {
    const queued = await userWithQueuedTask("en");
    await addSessions(queued, [NIGHT_IN_MOSCOW], SETUP_TIME);
    const timeBlock = await timeBlockAfterCron(queued, SETUP_TIME);

    expect(textOf(timeBlock.callout)).toMatch(/^Total: /);
    expect(textOf(timeBlock.toggle)).toBe("Session log");
    expect(lineTexts(timeBlock)).toEqual(["Oct 31 23:30–Nov 1 00:15 · 45 min"]);
  });
});
