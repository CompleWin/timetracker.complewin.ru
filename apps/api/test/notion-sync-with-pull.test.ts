import { beforeEach, describe, expect, it } from "vitest";
import { atMinute } from "./harness/clock.ts";
import { queryUrlOf } from "./harness/notion-pull.ts";
import {
  cronAt,
  fakeNotionSync,
  userWithTaskPage,
  type FakeNotionSync,
} from "./harness/notion-sync.ts";
import { onlyCall } from "./harness/notion.ts";

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

describe("фейковый Notion шагов 10 и 11", () => {
  it("21. на query pull отвечает пустым списком: cron без изменений в трекере отправляет только query pull в базу задачи", async () => {
    const { tasks } = await userWithTaskPage(fake);
    const requests = await fake.requestsDuring(() => cronAt(atMinute(30)));

    expect(onlyCall(requests)).toMatchObject({
      method: "POST",
      url: queryUrlOf(tasks.dataSource),
    });
  });
});
