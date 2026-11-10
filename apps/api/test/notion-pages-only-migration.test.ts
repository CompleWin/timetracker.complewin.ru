import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import {
  SETUP_TIME,
  TASKS_DATABASE,
  cronAt,
  fakeNotionSync,
  loginForSync,
  readTask,
  syncStatus,
  type FakeNotionSync,
} from "./harness/notion-sync.ts";
import { linkedTask, type LinkedTask } from "./harness/notion-task-pages.ts";
import { onlyCall } from "./harness/notion.ts";
import {
  clearValuesInRowsOf,
  replayPagesOnlyMigration,
  type SnapshotEdit,
} from "./harness/schema-replay.ts";

type QueuedBeforeMigration = {
  session: TestSession;
  withPage: LinkedTask;
  withoutPage: LinkedTask;
};

let fake: FakeNotionSync;

beforeEach(() => {
  fake = fakeNotionSync();
});

function forgetPageOf({ task, page }: LinkedTask): SnapshotEdit {
  const pageIds = [page.id, page.id.replaceAll("-", "")];
  return clearValuesInRowsOf(
    task.id,
    (value) => value === task.notionDatabaseId || pageIds.some((id) => value.includes(id)),
  );
}

async function migratedQueue(): Promise<QueuedBeforeMigration> {
  const session = await loginForSync();
  const { tasks } = await fake.connectNotion(session, { databases: { tasks: TASKS_DATABASE } });
  const withPage = await linkedTask(fake, session, tasks, { title: "Со страницей" });
  const withoutPage = await linkedTask(fake, session, tasks, { title: "Без страницы" });
  await replayPagesOnlyMigration(forgetPageOf(withoutPage));
  return { session, withPage, withoutPage };
}

describe("миграция очереди", () => {
  it("11. после миграции в очереди остался только элемент задачи со страницей", async () => {
    const { session, withoutPage } = await migratedQueue();

    expect(await readTask(session, withoutPage.task.id, SETUP_TIME)).toMatchObject({
      notionPageUrl: null,
    });
    expect(await syncStatus(session, SETUP_TIME)).toMatchObject({ pendingTasks: 1 });
  });

  it("11. элемент задачи со страницей обрабатывается: cron отправляет PATCH её страницы и ничего по задаче без страницы", async () => {
    const { withPage, withoutPage } = await migratedQueue();
    await cronAt(SETUP_TIME);

    onlyCall(fake.pages.updates(withPage.page));
    expect(fake.pages.updates(withoutPage.page)).toEqual([]);
    expect(fake.pages.creations()).toEqual([]);
  });
});
