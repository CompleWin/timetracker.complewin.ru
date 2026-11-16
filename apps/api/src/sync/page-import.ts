import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { runAll } from "../db/bulk.ts";
import { tasks } from "../db/schema.ts";
import type { NotionDatabaseRow } from "../notion/databases.ts";
import { deletedNotionPageIds } from "../notion/deleted-pages.ts";
import { projectValueOf } from "../notion/page-projects.ts";
import {
  pageTitle,
  statusOptionId,
  taskTitleOf,
  type NotionPageSnapshot,
} from "../notion/pages.ts";
import { projectOfRecord, type ProjectBook } from "../notion/record-projects.ts";
import { normalizedNotionId } from "../notion/webhook-events.ts";
import { enqueueTasksWithSessions } from "./outbox.ts";
import { attachPage, insertPageTask } from "./page-links.ts";
import type { SyncRun } from "./task-pages.ts";

type PagelessTasks = Map<string, string[]>;

export async function importPages(
  run: SyncRun,
  book: ProjectBook,
  target: NotionDatabaseRow,
  pages: NotionPageSnapshot[],
): Promise<boolean> {
  const deleted = await deletedNotionPageIds(
    run.db,
    run.owner.id,
    pages.map(({ id }) => id),
  );
  const wanted = pages.filter(
    (page) => !deleted.has(normalizedNotionId(page.id)) && isWanted(page, target),
  );
  if (wanted.length === 0) return false;
  const pageless = await pagelessTasks(run);
  const writes: BatchItem<"sqlite">[] = [];
  const attachedIds: string[] = [];
  for (const page of wanted) {
    const title = taskTitleOf(page, target.propertyIds.title, run.owner.locale);
    const value = projectValueOf(page, target);
    const { projectId, sentProject, defaultProject } = await projectOfRecord(book, value, target);
    const link = {
      notionDatabaseId: target.id,
      notionPageId: page.id,
      notionPageUrl: page.url,
      notionSent: { title, project: sentProject, time: null },
      notionDefaultProject: defaultProject,
    };
    const taskId = pageless.get(taskKey(projectId, title))?.shift();
    if (taskId === undefined) {
      writes.push(
        insertPageTask(
          run.db,
          {
            id: crypto.randomUUID(),
            userId: run.owner.id,
            title,
            projectId,
            ...link,
            createdAt: run.now,
            updatedAt: run.now,
          },
          "automatic",
        ),
      );
    } else {
      writes.push(attachPage(run.db, run.owner.id, taskId, link, run.now));
      attachedIds.push(taskId);
    }
  }
  await runAll(run.db, writes);
  await enqueueTasksWithSessions(run.db, run.owner.id, attachedIds, run.now);
  return attachedIds.length < wanted.length;
}

function isWanted(page: NotionPageSnapshot, target: NotionDatabaseRow): boolean {
  const status = statusOptionId(page, target.statusPropId);
  const skipped = status !== undefined && target.skippedStatusIds?.includes(status) === true;
  return !skipped && pageTitle(page, target.propertyIds.title).trim() !== "";
}

async function pagelessTasks(run: SyncRun): Promise<PagelessTasks> {
  const rows = await run.db
    .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, run.owner.id),
        isNull(tasks.notionPageId),
        isNull(tasks.archivedAt),
        isNotNull(tasks.projectId),
      ),
    );
  const found: PagelessTasks = new Map();
  for (const { id, title, projectId } of rows) {
    const key = taskKey(projectId, title);
    found.set(key, [...(found.get(key) ?? []), id]);
  }
  return found;
}

function taskKey(projectId: string | null, title: string): string {
  return `${projectId}/${title}`;
}
