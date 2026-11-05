import type { Locale } from "@stt/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { projects, tasks } from "../db/schema.ts";
import type { NotionClient } from "../notion/client.ts";
import { retrieveDataSource, titlePropertyId } from "../notion/data-sources.ts";
import { ensureTrackerProperties } from "../notion/database-setup.ts";
import { updateNotionDatabase, type NotionDatabaseRow } from "../notion/databases.ts";
import { trackerPropertiesFor } from "../notion/tracker-properties.ts";
import { updateTask } from "../tasks/tasks.ts";
import { IDLE_TIMER, taskTimers } from "../timers/time-entries.ts";
import { linkTask, markSynced, unlinkTask } from "./page-links.ts";
import { syncTimeBlock } from "./time-block.ts";
import {
  createdPage,
  createPage,
  ensureAccepted,
  isBadRequest,
  isMissingProperty,
  isNotFound,
  multiSelectNames,
  PageGone,
  PageRejected,
  retrievePage,
  updatePage,
  type PageReply,
} from "./page-requests.ts";
import {
  changedPageProperties,
  desiredPage,
  hasChanges,
  newPageProperties,
  projectChanged,
  sentOnCreate,
  sentOnUpdate,
  usesMultiSelect,
  type SentPage,
  type TaskSnapshot,
} from "./page-state.ts";

export type PushRun = {
  db: Database;
  client: NotionClient;
  owner: { id: string; locale: Locale; timeZone: string | null };
  databases: NotionDatabaseRow[];
  now: Date;
};

type LoadedTask = {
  id: string;
  notionDatabaseId: string | null;
  notionPageId: string | null;
  notionSent: SentPage | null;
  projectDatabaseId: string | null;
  snapshot: TaskSnapshot;
};

type LinkedTask = LoadedTask & { notionPageId: string; notionSent: SentPage };

type PageSender = (target: NotionDatabaseRow) => Promise<PageReply>;

export async function pushTask(run: PushRun, taskId: string): Promise<void> {
  const task = await loadTask(run, taskId);
  const target = task === undefined ? undefined : targetDatabase(run, task);
  if (task === undefined || target === undefined) return;
  const pageAlive = isLinked(task)
    ? await updateTaskPage(run, task, target)
    : await createTaskPage(run, task, target);
  if (pageAlive) await syncTimeBlock(run, taskId);
}

async function loadTask(run: PushRun, taskId: string): Promise<LoadedTask | undefined> {
  const [row] = await run.db
    .select({
      task: tasks,
      projectName: projects.name,
      projectDatabaseId: projects.notionDatabaseId,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(eq(tasks.id, taskId));
  if (row === undefined) return undefined;
  const timers = await taskTimers(run.db, run.owner.id, run.now, taskId);
  const timer = timers.get(taskId) ?? IDLE_TIMER;
  return {
    id: row.task.id,
    notionDatabaseId: row.task.notionDatabaseId,
    notionPageId: row.task.notionPageId,
    notionSent: row.task.notionSent,
    projectDatabaseId: row.projectDatabaseId,
    snapshot: {
      title: row.task.title,
      project: row.projectName,
      totalSec: timer.totalSec,
      running: timer.runningSessionId !== null,
      lastStartedAt: timer.lastStartedAt,
    },
  };
}

function targetDatabase(run: PushRun, task: LoadedTask): NotionDatabaseRow | undefined {
  const byId = (id: string | null) => run.databases.find((database) => database.id === id);
  return (
    byId(task.notionDatabaseId) ??
    byId(task.projectDatabaseId) ??
    run.databases.find((database) => database.isDefault)
  );
}

function isLinked(task: LoadedTask): task is LinkedTask {
  return task.notionPageId !== null && task.notionSent !== null;
}

async function createTaskPage(
  run: PushRun,
  task: LoadedTask,
  target: NotionDatabaseRow,
): Promise<boolean> {
  const desired = desiredPage(task.snapshot, target, run.owner.locale);
  const { reply, target: usedTarget } = await sendWithFreshProperties(run, target, (current) =>
    createPage(run.client, current.dataSourceId, newPageProperties(current, desired)),
  );
  const page = createdPage(reply);
  const link = { pageId: page.id, pageUrl: page.url, databaseId: usedTarget.id };
  await linkTask(run.db, task.id, link, sentOnCreate(usedTarget, desired), run.now);
  return true;
}

async function updateTaskPage(
  run: PushRun,
  task: LinkedTask,
  target: NotionDatabaseRow,
): Promise<boolean> {
  try {
    return await patchTaskPage(run, task, target);
  } catch (error) {
    if (!(error instanceof PageGone)) throw error;
    return recreateTaskPage(run, task);
  }
}

async function recreateTaskPage(run: PushRun, task: LinkedTask): Promise<boolean> {
  await unlinkTask(run.db, task.id);
  const unlinked = { ...task, notionDatabaseId: null, notionPageId: null, notionSent: null };
  const target = targetDatabase(run, unlinked);
  return target !== undefined && (await createTaskPage(run, unlinked, target));
}

async function patchTaskPage(
  run: PushRun,
  task: LinkedTask,
  target: NotionDatabaseRow,
): Promise<boolean> {
  const sent = task.notionSent;
  const desired = desiredPage(task.snapshot, target, run.owner.locale);
  if (!hasChanges(target, desired, sent)) {
    await markSynced(run.db, task.id, sent, run.now);
    return true;
  }
  const values = await currentMultiSelect(run, task, target, desired);
  const patch: PageSender = (current) =>
    updatePage(
      run.client,
      task.notionPageId,
      changedPageProperties(current, desired, sent, values),
    );
  const reply = await patch(target);
  if (isNotFound(reply)) throw new PageGone();
  if (isBadRequest(reply) && (await isTrashed(run, task.notionPageId))) {
    await updateTask(run.db, run.owner.id, task.id, { archived: true }, run.now);
    return false;
  }
  const accepted = isMissingProperty(reply)
    ? await patch(await refreshProperties(run, target))
    : reply;
  ensureAccepted(accepted);
  await markSynced(run.db, task.id, sentOnUpdate(target, desired, sent), run.now);
  return true;
}

async function currentMultiSelect(
  run: PushRun,
  task: LinkedTask,
  target: NotionDatabaseRow,
  desired: SentPage,
): Promise<string[]> {
  if (!usesMultiSelect(target) || !projectChanged(target, desired, task.notionSent)) return [];
  if (target.projectPropId === null) return [];
  const page = await retrievePage(run.client, task.notionPageId);
  return multiSelectNames(page, target.projectPropId);
}

async function isTrashed(run: PushRun, pageId: string): Promise<boolean> {
  const page = await retrievePage(run.client, pageId);
  return page.in_trash === true;
}

async function sendWithFreshProperties(
  run: PushRun,
  target: NotionDatabaseRow,
  send: PageSender,
): Promise<{ reply: PageReply; target: NotionDatabaseRow }> {
  const reply = await send(target);
  if (!isMissingProperty(reply)) return { reply, target };
  const refreshed = await refreshProperties(run, target);
  return { reply: await send(refreshed), target: refreshed };
}

async function refreshProperties(
  run: PushRun,
  target: NotionDatabaseRow,
): Promise<NotionDatabaseRow> {
  const source = await retrieveDataSource(run.client, target.dataSourceId);
  if (source === undefined) throw new PageRejected("Notion data source was not found");
  const wanted = trackerPropertiesFor(target);
  const ids = await ensureTrackerProperties(run.client, source, wanted, run.owner);
  const propertyIds = { ...target.propertyIds, title: titlePropertyId(source), ...ids };
  const refreshed = await updateNotionDatabase(run.db, target, { propertyIds });
  run.databases = run.databases.map((database) =>
    database.id === refreshed.id ? refreshed : database,
  );
  return refreshed;
}
