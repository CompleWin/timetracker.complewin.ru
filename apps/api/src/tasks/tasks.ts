import {
  NO_PROJECT,
  titleMatches,
  type ArchivedFilter,
  type Task,
  type TaskListQuery,
  type UpdateTaskBody,
} from "@stt/shared";
import { and, eq, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { archivedAtAfter } from "../db/archive.ts";
import type { Database } from "../db/client.ts";
import { sortByName } from "../db/order.ts";
import { projects, tasks } from "../db/schema.ts";
import { notFound, validationError } from "../http/errors.ts";
import { isActiveProject } from "../projects/projects.ts";

type TaskRow = typeof tasks.$inferSelect;

export type NewTask = {
  title: string;
  projectId: string | null;
};

const activityConditions: Record<ArchivedFilter, SQL | undefined> = {
  false: and(isNull(tasks.archivedAt), isNull(projects.archivedAt)),
  true: or(isNotNull(tasks.archivedAt), isNotNull(projects.archivedAt)),
  all: undefined,
};

export async function listTasks(
  db: Database,
  userId: string,
  { projectId, archived, q }: TaskListQuery,
): Promise<Task[]> {
  const rows = await db
    .select({ task: tasks })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.userId, userId), projectCondition(projectId), activityConditions[archived]))
    .then((joined) => joined.map(({ task }) => task));
  const found = q === undefined ? rows : rows.filter((row) => titleMatches(row.title, q));
  return sortByName(found, (row) => row.title).map(toTask);
}

export async function getTask(db: Database, userId: string, id: string): Promise<Task> {
  return toTask(await requireTask(db, userId, id));
}

export async function createTask(
  db: Database,
  userId: string,
  task: NewTask,
  now: Date,
): Promise<Task> {
  await ensureProjectUsable(db, userId, task.projectId);
  const [row] = await db
    .insert(tasks)
    .values({ id: crypto.randomUUID(), userId, ...task, createdAt: now, updatedAt: now })
    .returning();
  if (row === undefined) throw new Error(`Task "${task.title}" was not created`);
  return toTask(row);
}

export async function updateTask(
  db: Database,
  userId: string,
  id: string,
  changes: UpdateTaskBody,
  now: Date,
): Promise<Task> {
  const current = await requireTask(db, userId, id);
  await ensureProjectUsable(db, userId, changes.projectId);
  const [row] = await db
    .update(tasks)
    .set({
      title: changes.title,
      projectId: changes.projectId,
      archivedAt: archivedAtAfter(current.archivedAt, changes.archived, now),
      updatedAt: now,
    })
    .where(eq(tasks.id, id))
    .returning();
  if (row === undefined) throw new Error(`Task ${id} was not updated`);
  return toTask(row);
}

function projectCondition(projectId: string | undefined): SQL | undefined {
  if (projectId === undefined) return undefined;
  return projectId === NO_PROJECT ? isNull(tasks.projectId) : eq(tasks.projectId, projectId);
}

async function requireTask(db: Database, userId: string, id: string): Promise<TaskRow> {
  const row = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
  });
  if (row === undefined) throw notFound();
  return row;
}

async function ensureProjectUsable(
  db: Database,
  userId: string,
  projectId: string | null | undefined,
): Promise<void> {
  if (projectId === null || projectId === undefined) return;
  if (!(await isActiveProject(db, userId, projectId))) {
    throw validationError({ projectId: "Expected an own active project" });
  }
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
