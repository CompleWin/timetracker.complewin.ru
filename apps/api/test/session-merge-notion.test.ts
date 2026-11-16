import { beforeEach, describe, expect, it } from "vitest";
import { addSession, interval } from "./harness/manual-sessions.ts";
import { lineTexts } from "./harness/notion-blocks.ts";
import { cronAt } from "./harness/notion-sync.ts";
import {
  FIRST_SESSION,
  NEXT_RUN,
  fakeNotionTimeBlocks,
  userWithSessionLog,
  type FakeNotionTimeBlocks,
} from "./harness/notion-time-block.ts";
import { onlyCall } from "./harness/notion.ts";

let fake: FakeNotionTimeBlocks;

beforeEach(() => {
  fake = fakeNotionTimeBlocks();
});

describe("журнал сессий в Notion", () => {
  it("21. ручная сессия сразу после сессии из журнала: cron обновляет её строку на слитый интервал, новой строки нет", async () => {
    const user = await userWithSessionLog(fake.sync, [FIRST_SESSION]);
    const before = fake.blocks.timeBlockOn(user.page);
    const [firstLine] = before.lines;
    if (!firstLine) throw new Error("The session log has no line of the first session");

    await addSession(user.session, user.task.id, interval("01:30", "02:00"), NEXT_RUN);
    const run = await fake.blocks.callsDuring(() => cronAt(NEXT_RUN));
    const after = fake.blocks.timeBlockOn(user.page);

    onlyCall(run.updates(firstLine));
    expect(run.appends(before.toggle.id)).toEqual([]);
    expect(lineTexts(after)).toEqual(["01.01 04:00–05:00 · 1 ч"]);
  });
});
