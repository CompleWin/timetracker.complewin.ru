import type { ArchivedFilter, Project, ProjectColor, UpdateProjectBody } from "@stt/shared";
import { and, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { archivedAtAfter } from "../db/archive.ts";
import type { Database } from "../db/client.ts";
import { sortByName } from "../db/order.ts";
import { projects } from "../db/schema.ts";
import { nameTaken, notFound } from "../http/errors.ts";
import { enqueueProjectTasks, enqueueTasks } from "../sync/outbox.ts";
import { projectTotals, stopProjectEntries } from "../timers/time-entries.ts";

type ProjectRow = typeof projects.$inferSelect;

export type ProjectRef = Pick<ProjectRow, "id" | "name" | "notionDatabaseId">;

export type NewProject = {
  name: string;
  color: ProjectColor;
  notionDatabaseId: string | null;
};

const archivedConditions: Record<ArchivedFilter, SQL | undefined> = {
  false: isNull(projects.archivedAt),
  true: isNotNull(projects.archivedAt),
  all: undefined,
};

export async function listProjects(
  db: Database,
  userId: string,
  archived: ArchivedFilter,
  now: Date,
): Promise<Project[]> {
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), archivedConditions[archived])),
    projectTotals(db, userId, now),
  ]);
  return sortByName(rows, (row) => row.name).map((row) => toProject(row, totals.get(row.id) ?? 0));
}

export async function getProject(
  db: Database,
  userId: string,
  id: string,
  now: Date,
): Promise<Project> {
  return withTotal(db, await requireProject(db, userId, id), now);
}

export async function isActiveProject(db: Database, userId: string, id: string): Promise<boolean> {
  const row = await findProject(db, userId, id);
  return row !== undefined && row.archivedAt === null;
}

export async function createProject(
  db: Database,
  userId: string,
  project: NewProject,
  now: Date,
): Promise<Project> {
  await ensureNameFree(db, userId, project.name);
  const [row] = await db
    .insert(projects)
    .values({ id: crypto.randomUUID(), userId, ...project, createdAt: now, updatedAt: now })
    .returning();
  if (row === undefined) throw new Error(`Project "${project.name}" was not created`);
  return toProject(row, 0);
}

export async function updateProject(
  db: Database,
  userId: string,
  id: string,
  changes: UpdateProjectBody,
  now: Date,
): Promise<Project> {
  const current = await requireProject(db, userId, id);
  const name = changes.name ?? current.name;
  const archivedAt = archivedAtAfter(current.archivedAt, changes.archived, now);
  if (archivedAt === null) await ensureNameFree(db, userId, name, id);
  const stopped = changes.archived === true ? await stopProjectEntries(db, userId, id, now) : [];
  const [row] = await db
    .update(projects)
    .set({
      name,
      color: changes.color,
      archivedAt,
      updatedAt: now,
    })
    .where(eq(projects.id, id))
    .returning();
  if (row === undefined) throw new Error(`Project ${id} was not updated`);
  await enqueueTasks(
    db,
    userId,
    stopped.map(({ taskId }) => taskId),
    now,
  );
  if (name !== current.name) await enqueueProjectTasks(db, userId, id, now);
  return withTotal(db, row, now);
}

export function activeProjects(db: Database, userId: string): Promise<ProjectRef[]> {
  return db
    .select({ id: projects.id, name: projects.name, notionDatabaseId: projects.notionDatabaseId })
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.archivedAt)));
}

export async function bindProjectToDatabase(
  db: Database,
  id: string,
  notionDatabaseId: string,
  now: Date,
): Promise<void> {
  await db.update(projects).set({ notionDatabaseId, updatedAt: now }).where(eq(projects.id, id));
}

export function sameProjectName(left: string, right: string): boolean {
  return nameKey(left) === nameKey(right);
}

async function findProject(
  db: Database,
  userId: string,
  id: string,
): Promise<ProjectRow | undefined> {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.userId, userId)),
  });
}

async function requireProject(db: Database, userId: string, id: string): Promise<ProjectRow> {
  const row = await findProject(db, userId, id);
  if (row === undefined) throw notFound();
  return row;
}

async function ensureNameFree(
  db: Database,
  userId: string,
  name: string,
  exceptId?: string,
): Promise<void> {
  const active = await activeProjects(db, userId);
  if (active.some((project) => project.id !== exceptId && sameProjectName(project.name, name))) {
    throw nameTaken();
  }
}

function nameKey(name: string): string {
  return name.toLowerCase();
}

async function withTotal(db: Database, row: ProjectRow, now: Date): Promise<Project> {
  const totals = await projectTotals(db, row.userId, now, row.id);
  return toProject(row, totals.get(row.id) ?? 0);
}

function toProject(row: ProjectRow, totalSec: number): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    totalSec,
    notionDatabaseId: row.notionDatabaseId,
  };
}
