import type { Locale } from "@stt/shared";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { notionDatabases, projects, tasks } from "../db/schema.ts";
import type { NotionClient } from "../notion/client.ts";
import { retrieveDataSource, titlePropertyId } from "../notion/data-sources.ts";
import { ensureTrackerProperties } from "../notion/database-setup.ts";
import { updateNotionDatabase, type NotionDatabaseRow } from "../notion/databases.ts";
import {
  missingAutomaticTimeFields,
  selectTimeFieldIds,
  trackerPropertiesFor,
} from "../notion/tracker-properties.ts";
import { updateTask } from "../tasks/tasks.ts";
import { IDLE_TIMER, taskTimers } from "../timers/time-entries.ts";
import { enqueueDatabaseTasks } from "./outbox.ts";
import { markSynced, unlinkTask } from "./page-links.ts";
import { syncTimeBlock } from "./time-block.ts";
import {
  ensureAccepted,
  isBadRequest,
  isMissingProperty,
  isNotFound,
  multiSelectNames,
  PageGone,
  PageRejected,
  retrievePage,
  updatePage,
} from "./page-requests.ts";
import {
  changedPageProperties,
  desiredPage,
  hasChanges,
  projectChanged,
  pushedTarget,
  sentOnUpdate,
  usesMultiSelect,
  type SentPage,
  type TaskSnapshot,
} from "./page-state.ts";

export type SyncRun = {
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
  notionDefaultProject: boolean;
  snapshot: TaskSnapshot;
};

type LinkedTask = LoadedTask & { notionPageId: string; notionSent: SentPage };

class TaskNoLongerLinked extends Error {}

export class TimeFieldsChanged extends Error {}

export async function pushTask(run: SyncRun, taskId: string): Promise<void> {
  const task = await loadTask(run, taskId);
  if (task === undefined || !isLinked(task)) return;
  const target = run.databases.find((database) => database.id === task.notionDatabaseId);
  if (target === undefined) return;
  const taskRun = { ...run };
  taskRun.client = taskPushClient(taskRun, task);
  try {
    if (await updateTaskPage(taskRun, task, target)) await syncTimeBlock(taskRun, taskId);
  } catch (error) {
    if (!(error instanceof TaskNoLongerLinked)) throw error;
  } finally {
    run.databases = taskRun.databases;
  }
}

function taskPushClient(run: SyncRun, task: LinkedTask): NotionClient {
  const client = run.client;
  async function beforeSend(checkTimeFields: boolean): Promise<void> {
    const target = run.databases.find(({ id }) => id === task.notionDatabaseId);
    if (target === undefined) throw new TaskNoLongerLinked();
    const [current] = await run.db
      .select({
        timeProperties: notionDatabases.timeProperties,
        timeFieldSettings: notionDatabases.timeFieldSettings,
      })
      .from(tasks)
      .innerJoin(notionDatabases, eq(notionDatabases.id, tasks.notionDatabaseId))
      .where(
        and(
          eq(tasks.id, task.id),
          eq(tasks.userId, run.owner.id),
          eq(tasks.notionPageId, task.notionPageId),
          eq(tasks.notionDatabaseId, target.id),
        ),
      );
    if (current === undefined) throw new TaskNoLongerLinked();
    if (
      checkTimeFields &&
      (current.timeProperties !== target.timeProperties ||
        JSON.stringify(current.timeFieldSettings) !== JSON.stringify(target.timeFieldSettings))
    ) {
      throw new TimeFieldsChanged();
    }
  }

  return {
    request: (request) => {
      const checkTimeFields =
        request.method === "PATCH" &&
        (request.path.startsWith("/v1/pages/") || request.path.startsWith("/v1/data_sources/"));
      return client.request(
        request.method === "GET"
          ? request
          : { ...request, beforeSend: () => beforeSend(checkTimeFields) },
      );
    },
  };
}

async function loadTask(run: SyncRun, taskId: string): Promise<LoadedTask | undefined> {
  const [row] = await run.db
    .select({ task: tasks, projectName: projects.name })
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
    notionDefaultProject: row.task.notionDefaultProject,
    snapshot: {
      title: row.task.title,
      project: row.projectName,
      totalSec: timer.totalSec,
      running: timer.runningSessionId !== null,
      lastStartedAt: timer.lastStartedAt,
    },
  };
}

function isLinked(task: LoadedTask): task is LinkedTask {
  return task.notionPageId !== null && task.notionSent !== null;
}

async function updateTaskPage(
  run: SyncRun,
  task: LinkedTask,
  target: NotionDatabaseRow,
): Promise<boolean> {
  try {
    return await patchTaskPage(run, task, target);
  } catch (error) {
    if (!(error instanceof PageGone)) throw error;
    await dropDeletedPage(run, task.id);
    return false;
  }
}

export async function dropDeletedPage(run: SyncRun, taskId: string): Promise<void> {
  await unlinkTask(run.db, taskId);
  await updateTask(run.db, run.owner.id, taskId, { archived: true }, run.now);
}

async function patchTaskPage(
  run: SyncRun,
  task: LinkedTask,
  database: NotionDatabaseRow,
): Promise<boolean> {
  let target = pushedTarget(database, task.notionDefaultProject);
  const sent = task.notionSent;
  let desired = desiredPage(task.snapshot, target, run.owner.locale);
  if (!hasChanges(target, desired, sent)) {
    await markSynced(run.db, task.id, sent, run.now);
    return true;
  }
  const values = await currentMultiSelect(run, task, target, desired);
  const patch = () =>
    updatePage(run.client, task.notionPageId, changedPageProperties(target, desired, sent, values));
  let reply = await patch();
  if (isNotFound(reply)) throw new PageGone();
  if (isBadRequest(reply) && (await isTrashed(run, task.notionPageId))) {
    await dropDeletedPage(run, task.id);
    return false;
  }
  if (isMissingProperty(reply)) {
    target = pushedTarget(await refreshProperties(run, database), task.notionDefaultProject);
    desired = desiredPage(task.snapshot, target, run.owner.locale);
    reply = await patch();
  }
  ensureAccepted(reply);
  await markSynced(run.db, task.id, sentOnUpdate(target, desired, sent), run.now);
  return true;
}

async function currentMultiSelect(
  run: SyncRun,
  task: LinkedTask,
  target: NotionDatabaseRow,
  desired: SentPage,
): Promise<string[]> {
  if (!usesMultiSelect(target) || !projectChanged(target, desired, task.notionSent)) return [];
  if (target.projectPropId === null) return [];
  const page = await retrievePage(run.client, task.notionPageId);
  return multiSelectNames(page, target.projectPropId);
}

async function isTrashed(run: SyncRun, pageId: string): Promise<boolean> {
  const page = await retrievePage(run.client, pageId);
  return page.in_trash === true;
}

async function refreshProperties(
  run: SyncRun,
  target: NotionDatabaseRow,
): Promise<NotionDatabaseRow> {
  const source = await retrieveDataSource(run.client, target.dataSourceId);
  if (source === undefined) throw new PageRejected("Notion data source was not found");
  const wanted = trackerPropertiesFor(target);
  const settings = target.timeFieldSettings;
  const missing = missingAutomaticTimeFields(source.properties, settings);
  const ids = await ensureTrackerProperties(run.client, source, [...wanted, ...missing], run.owner);
  const propertyIds = { ...target.propertyIds, title: titlePropertyId(source) };
  for (const property of wanted) propertyIds[property] = ids[property];
  const restored = selectTimeFieldIds(ids);
  const timeFieldSettings =
    settings !== null && missing.some((field) => restored[field] !== settings.propertyIds[field])
      ? {
          ...settings,
          propertyIds: { ...settings.propertyIds, ...restored },
          revision: crypto.randomUUID(),
        }
      : undefined;
  const refreshed = await updateNotionDatabase(
    run.db,
    target,
    { propertyIds, timeFieldSettings },
    () => new TimeFieldsChanged(),
  );
  run.databases = run.databases.map((database) =>
    database.id === refreshed.id ? refreshed : database,
  );
  if (timeFieldSettings !== undefined) {
    await enqueueDatabaseTasks(run.db, run.owner.id, refreshed.id, run.now);
  }
  return refreshed;
}
