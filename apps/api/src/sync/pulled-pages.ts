import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { idChunks, runAll } from "../db/bulk.ts";
import { projects, tasks } from "../db/schema.ts";
import type { NotionDatabaseRow } from "../notion/databases.ts";
import { changedInNotion, chosenOption, projectValueOf } from "../notion/page-projects.ts";
import { taskTitleOf, type NotionPageSnapshot } from "../notion/pages.ts";
import {
  projectOfRecord,
  projectWithoutValue,
  type ProjectBook,
  type RecordProject,
} from "../notion/record-projects.ts";
import type { SentPage } from "./page-state.ts";
import type { SyncRun } from "./task-pages.ts";

export type PulledTask = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  notionSent: SentPage;
  titleChangedAt: Date;
  projectChangedAt: Date | null;
};

type PulledChanges = {
  title: string | undefined;
  projectId: string | undefined;
  notionSent: SentPage;
};

export async function linkedTasks(
  run: SyncRun,
  pages: NotionPageSnapshot[],
): Promise<Map<string, PulledTask>> {
  const found = new Map<string, PulledTask>();
  for (const pageIds of idChunks(pages.map((page) => page.id))) {
    const rows = await run.db
      .select({ task: tasks, projectName: projects.name })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.userId, run.owner.id), inArray(tasks.notionPageId, pageIds)));
    for (const { task, projectName } of rows) {
      if (task.notionPageId === null || task.notionSent === null) continue;
      found.set(task.notionPageId, {
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName,
        notionSent: task.notionSent,
        titleChangedAt: task.titleChangedAt ?? task.createdAt,
        projectChangedAt: task.projectChangedAt,
      });
    }
  }
  return found;
}

export async function applyLinkedPages(
  run: SyncRun,
  book: ProjectBook,
  target: NotionDatabaseRow,
  linked: Map<string, PulledTask>,
  pages: NotionPageSnapshot[],
): Promise<void> {
  const writes: BatchItem<"sqlite">[] = [];
  for (const page of pages) {
    const task = linked.get(page.id);
    const changes = task && (await pageChanges(run, book, target, task, page));
    if (task === undefined || changes === undefined) continue;
    writes.push(
      run.db
        .update(tasks)
        .set({ ...changes, updatedAt: run.now })
        .where(eq(tasks.id, task.id)),
    );
  }
  await runAll(run.db, writes);
}

async function pageChanges(
  run: SyncRun,
  book: ProjectBook,
  target: NotionDatabaseRow,
  task: PulledTask,
  page: NotionPageSnapshot,
): Promise<PulledChanges | undefined> {
  const title = titleFromNotion(run, target, task, page);
  const project =
    (await projectFromNotion(book, target, task, page)) ??
    (await projectOfOrphan(book, target, task, page));
  if (title === undefined && project === undefined) return undefined;
  const sent = task.notionSent;
  return {
    title,
    projectId: project?.projectId,
    notionSent: {
      ...sent,
      title: title ?? sent.title,
      project: project === undefined ? sent.project : project.sentProject,
    },
  };
}

function titleFromNotion(
  run: SyncRun,
  target: NotionDatabaseRow,
  task: PulledTask,
  page: NotionPageSnapshot,
): string | undefined {
  const notionTitle = taskTitleOf(page, target.propertyIds.title, run.owner.locale);
  const sentTitle = task.notionSent.title;
  if (notionTitle === sentTitle) return undefined;
  const changedInTracker = task.title !== sentTitle;
  return changedInTracker && page.lastEditedAt < task.titleChangedAt ? undefined : notionTitle;
}

async function projectFromNotion(
  book: ProjectBook,
  target: NotionDatabaseRow,
  task: PulledTask,
  page: NotionPageSnapshot,
): Promise<RecordProject | undefined> {
  const value = projectValueOf(page, target);
  if (!changedInNotion(value, task.notionSent.project)) return undefined;
  return keepsTrackerProject(task, page) ? undefined : projectOfRecord(book, value, target);
}

function keepsTrackerProject(task: PulledTask, page: NotionPageSnapshot): boolean {
  return (
    task.projectChangedAt !== null &&
    task.projectName !== task.notionSent.project &&
    page.lastEditedAt < task.projectChangedAt
  );
}

async function projectOfOrphan(
  book: ProjectBook,
  target: NotionDatabaseRow,
  task: PulledTask,
  page: NotionPageSnapshot,
): Promise<RecordProject | undefined> {
  if (target.pullCursor !== null || task.projectId !== null) return undefined;
  if (chosenOption(projectValueOf(page, target), book.projects) !== null) return undefined;
  const project = await projectWithoutValue(book, target);
  return { projectId: project.id, sentProject: task.notionSent.project };
}
