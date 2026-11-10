import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCall } from "./harness/index.ts";
import { atMinute } from "./harness/clock.ts";
import { addSession } from "./harness/manual-sessions.ts";
import {
  cronAt,
  fakeNotionSync,
  readTask,
  syncStatus,
  type FakeNotionSync,
} from "./harness/notion-sync.ts";
import { userWithTaskPage, type UserWithTaskPage } from "./harness/notion-task-pages.ts";
import { onlyCall } from "./harness/notion.ts";
import { updateTask } from "./harness/tasks.ts";
import { startTimer } from "./harness/timers.ts";

type RemovedPage = UserWithTaskPage & {
  updates: ExternalCall[];
};

const REMOVAL_RUN = atMinute(1);
const RESTORED = atMinute(2);
const SESSION_RECORDED = atMinute(5);

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

async function runningTaskWithRemovedPage(): Promise<RemovedPage> {
  const user = await userWithTaskPage(fake);
  await startTimer(user.session, user.task.id, REMOVAL_RUN);
  fake.pages.remove(user.page);
  const updates = await fake.updatesDuring(user.page, () => cronAt(REMOVAL_RUN));
  return { ...user, updates };
}

describe("страница удалена из Notion", () => {
  it("4. 404 на PATCH страницы: POST /v1/pages нет, связь сброшена, задача в архиве, идущий таймер остановлен", async () => {
    const { session, task, updates } = await runningTaskWithRemovedPage();

    onlyCall(updates);
    expect(fake.pages.creations()).toEqual([]);
    expect(await readTask(session, task.id, REMOVAL_RUN)).toMatchObject({
      notionPageUrl: null,
      notionDatabaseId: null,
      archived: true,
      runningSessionId: null,
    });
  });

  it("4. после 404 элемента задачи в очереди нет, следующий cron ничего не отправляет, кроме query pull", async () => {
    const { session } = await runningTaskWithRemovedPage();

    expect(await syncStatus(session, REMOVAL_RUN)).toMatchObject({ pendingTasks: 0, failed: [] });
    expect(await fake.requestsExceptPullDuring(() => cronAt(atMinute(15)))).toEqual([]);
  });

  it("5. задача возвращена из архива и получает сессию: cron не отправляет ничего, кроме query pull", async () => {
    const { session, task } = await runningTaskWithRemovedPage();
    await updateTask(session, task.id, { archived: false }, RESTORED);
    await addSession(
      session,
      task.id,
      { startedAt: atMinute(3).now, endedAt: atMinute(4).now },
      SESSION_RECORDED,
    );

    expect(await fake.requestsExceptPullDuring(() => cronAt(SESSION_RECORDED))).toEqual([]);
    expect(await readTask(session, task.id, SESSION_RECORDED)).toMatchObject({
      archived: false,
      notionPageUrl: null,
    });
  });
});
