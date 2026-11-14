import { beforeEach, describe, expect, it } from "vitest";
import { atMinute } from "./harness/clock.ts";
import { addSession } from "./harness/manual-sessions.ts";
import { addDatabase } from "./harness/notion-databases.ts";
import { TASKS_BASE, pagesIn, startCursorOf } from "./harness/notion-import.ts";
import { fakeNotionPull, queryUrlOf, type FakeNotionPull } from "./harness/notion-pull.ts";
import { cronAt } from "./harness/notion-sync.ts";
import { onlyCall } from "./harness/notion.ts";
import {
  fakePageReads,
  queriesPerCron,
  sendEvent,
  unrelatedEvent,
  webhookTaskUser,
  webhookUser,
  type WebhookUser,
} from "./harness/notion-webhooks.ts";

const DAY_MIN = 24 * 60;
const EVENT_MINUTE = 1;
const PAGES_IN_TWO_QUERIES = 150;
const BULK_TIMEOUT_MS = 120_000;

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
  fakePageReads(fake.pages);
});

async function eventAfterFirstPull(user: WebhookUser): Promise<WebhookUser> {
  await cronAt(atMinute(0));
  await sendEvent(unrelatedEvent(), atMinute(EVENT_MINUTE));
  return user;
}

describe("частота pull", () => {
  it("19. событие было меньше 24 часов назад: cron читает базу раз в 30 минут", async () => {
    await eventAfterFirstPull(await webhookUser(fake));

    expect(await queriesPerCron(fake, [5, 29, 30, 35, 59, 60])).toEqual([0, 0, 1, 0, 0, 1]);
  });

  it("19. через 24 часа после события cron снова читает базу раз в 5 минут", async () => {
    await eventAfterFirstPull(await webhookUser(fake));
    const minutes = [DAY_MIN - 10, DAY_MIN - 5, DAY_MIN + 2, DAY_MIN + 7];

    expect(await queriesPerCron(fake, minutes)).toEqual([1, 0, 1, 1]);
  });

  it("19. база, добавленная после события, читается в первом же cron", async () => {
    const user = await eventAfterFirstPull(await webhookUser(fake));
    const dataSource = fake.workspace.dataSource({ title: ["Развлечения"] });
    await addDatabase(
      user.session,
      dataSource,
      { projectMode: "none", blockPosition: "none" },
      atMinute(2),
    );
    const query = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(3))));

    expect(query.url).toBe(queryUrlOf(dataSource));
  });

  it(
    "19. проход по курсору после события продолжается в следующем cron",
    { timeout: BULK_TIMEOUT_MS },
    async () => {
      const user = await webhookUser(fake, TASKS_BASE);
      pagesIn(fake, user.added, PAGES_IN_TWO_QUERIES, (index) =>
        atMinute(index + 1 - PAGES_IN_TWO_QUERIES),
      );
      await cronAt(atMinute(1));
      await sendEvent(unrelatedEvent(), atMinute(2));
      const query = onlyCall(await fake.queriesDuring(() => cronAt(atMinute(3))));

      expect(startCursorOf(query)).toBe("100");
    },
  );
});

describe("остальная работа cron", () => {
  it("20. после события сессия связанной задачи уходит в Notion в ближайший cron", async () => {
    const user = await webhookTaskUser(fake);
    await sendEvent(unrelatedEvent(), atMinute(EVENT_MINUTE));
    await addSession(
      user.session,
      user.task.id,
      { startedAt: atMinute(2).now, endedAt: atMinute(3).now },
      atMinute(3),
    );

    expect(await fake.updatesDuring(user.page, () => cronAt(atMinute(3)))).toHaveLength(1);
  });
});
