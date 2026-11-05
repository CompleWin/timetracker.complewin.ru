import { and, eq, inArray } from "drizzle-orm";
import { notionDatabases, projects, tasks } from "../db/schema.ts";
import { NotionReauthRequired } from "../notion/client.ts";
import type { NotionDatabaseRow } from "../notion/databases.ts";
import type { NotionApiRequest } from "../notion/http.ts";
import { changedInNotion, chosenOption, projectValueOf } from "../notion/page-projects.ts";
import {
  dataSourceQueryPath,
  pageListSchema,
  pagesOf,
  taskTitleOf,
  type NotionPageSnapshot,
} from "../notion/pages.ts";
import { activeProjects, projectNamed } from "../projects/projects.ts";
import {
  BudgetExhausted,
  ensureAccepted,
  PageRejected,
  RateLimited,
  sendRequest,
  ServerFailure,
} from "./page-requests.ts";
import type { SentPage } from "./page-state.ts";
import type { SyncRun } from "./task-pages.ts";

const MS_PER_MINUTE = 60_000;
const PULL_INTERVAL_MS = 5 * MS_PER_MINUTE;
const CURSOR_OVERLAP_MS = 2 * MS_PER_MINUTE;
const PULL_PAGE_SIZE = 100;
const MAX_PULL_PAGES = 5;

export type PullOutcome = "next" | "stop";

type PulledTask = {
  id: string;
  title: string;
  projectName: string | null;
  notionSent: SentPage;
  titleChangedAt: Date;
  projectChangedAt: Date;
};

type ProjectChoice = {
  projectId: string | null;
  name: string | null;
};

type QueryPage = {
  pages: NotionPageSnapshot[];
  nextCursor: string | undefined;
};

export async function pullUserChanges(run: SyncRun): Promise<PullOutcome> {
  for (const target of run.databases.filter((database) => isDue(database, run.now))) {
    try {
      await pullDatabase(run, target);
    } catch (error) {
      if (stopsUser(error)) return "stop";
      if (!(error instanceof ServerFailure || error instanceof PageRejected)) {
        console.error("Notion pull of database failed:", error);
      }
    }
  }
  return "next";
}

function isDue(database: NotionDatabaseRow, now: Date): boolean {
  return (
    database.pulledAt === null || now.getTime() - database.pulledAt.getTime() >= PULL_INTERVAL_MS
  );
}

function stopsUser(error: unknown): boolean {
  return (
    error instanceof RateLimited ||
    error instanceof BudgetExhausted ||
    error instanceof NotionReauthRequired
  );
}

async function pullDatabase(run: SyncRun, target: NotionDatabaseRow): Promise<void> {
  const cursor = target.pullCursor ?? target.createdAt;
  let latestEdit: number | undefined;
  let startCursor: string | undefined;
  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const result = await queryPage(run, target, cursor, startCursor);
    await applyPages(run, target, result.pages);
    for (const { lastEditedAt } of result.pages) {
      latestEdit = Math.max(latestEdit ?? lastEditedAt.getTime(), lastEditedAt.getTime());
    }
    startCursor = result.nextCursor;
    if (startCursor === undefined) break;
  }
  const pullCursor = latestEdit === undefined ? cursor : new Date(latestEdit - CURSOR_OVERLAP_MS);
  await run.db
    .update(notionDatabases)
    .set({ pullCursor, pulledAt: run.now })
    .where(eq(notionDatabases.id, target.id));
}

async function queryPage(
  run: SyncRun,
  target: NotionDatabaseRow,
  cursor: Date,
  startCursor: string | undefined,
): Promise<QueryPage> {
  const reply = await sendRequest(run.client, queryRequest(target, cursor, startCursor));
  ensureAccepted(reply);
  const list = pageListSchema.safeParse(reply.body);
  if (!list.success) throw new ServerFailure("Notion returned an unexpected page list");
  const nextCursor = list.data.has_more === true ? (list.data.next_cursor ?? undefined) : undefined;
  return { pages: pagesOf(list.data.results), nextCursor };
}

function queryRequest(
  target: NotionDatabaseRow,
  cursor: Date,
  startCursor: string | undefined,
): NotionApiRequest {
  return {
    method: "POST",
    path: dataSourceQueryPath(target.dataSourceId),
    body: {
      filter: {
        timestamp: "last_edited_time",
        last_edited_time: { on_or_after: cursor.toISOString() },
      },
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: PULL_PAGE_SIZE,
      ...(startCursor !== undefined && { start_cursor: startCursor }),
    },
  };
}

async function applyPages(
  run: SyncRun,
  target: NotionDatabaseRow,
  pages: NotionPageSnapshot[],
): Promise<void> {
  const linked = await linkedTasks(
    run,
    pages.map((page) => page.id),
  );
  for (const page of pages) {
    const task = linked.get(page.id);
    if (task !== undefined) await applyPage(run, target, task, page);
  }
}

async function linkedTasks(run: SyncRun, pageIds: string[]): Promise<Map<string, PulledTask>> {
  if (pageIds.length === 0) return new Map();
  const rows = await run.db
    .select({ task: tasks, projectName: projects.name })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.userId, run.owner.id), inArray(tasks.notionPageId, pageIds)));
  return new Map(
    rows.flatMap(({ task, projectName }): [string, PulledTask][] => {
      if (task.notionPageId === null || task.notionSent === null) return [];
      const pulled = {
        id: task.id,
        title: task.title,
        projectName,
        notionSent: task.notionSent,
        titleChangedAt: task.titleChangedAt ?? task.createdAt,
        projectChangedAt: task.projectChangedAt ?? task.createdAt,
      };
      return [[task.notionPageId, pulled]];
    }),
  );
}

async function applyPage(
  run: SyncRun,
  target: NotionDatabaseRow,
  task: PulledTask,
  page: NotionPageSnapshot,
): Promise<void> {
  const title = titleFromNotion(run, target, task, page);
  const project = await projectFromNotion(run, target, task, page);
  if (title === undefined && project === undefined) return;
  const sent = task.notionSent;
  await run.db
    .update(tasks)
    .set({
      title,
      projectId: project?.projectId,
      notionSent: {
        ...sent,
        title: title ?? sent.title,
        project: project === undefined ? sent.project : project.name,
      },
      updatedAt: run.now,
    })
    .where(eq(tasks.id, task.id));
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
  run: SyncRun,
  target: NotionDatabaseRow,
  task: PulledTask,
  page: NotionPageSnapshot,
): Promise<ProjectChoice | undefined> {
  const value = projectValueOf(page, target);
  const sentProject = task.notionSent.project;
  if (!changedInNotion(value, sentProject)) return undefined;
  const changedInTracker = task.projectName !== sentProject;
  if (changedInTracker && page.lastEditedAt < task.projectChangedAt) return undefined;
  const option = chosenOption(value, await activeProjects(run.db, run.owner.id));
  if (option === null) return { projectId: null, name: null };
  const project = await projectNamed(run.db, run.owner.id, option, run.now);
  return { projectId: project.id, name: project.name };
}
