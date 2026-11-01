import type { ArchivedFilter, Project, ProjectColor, UpdateProjectBody } from "@stt/shared";
import { and, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { archivedAtAfter } from "../db/archive.ts";
import type { Database } from "../db/client.ts";
import { sortByName } from "../db/order.ts";
import { projects } from "../db/schema.ts";
import { nameTaken, notFound } from "../http/errors.ts";

type ProjectRow = typeof projects.$inferSelect;

export type NewProject = {
  name: string;
  color: ProjectColor;
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
): Promise<Project[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), archivedConditions[archived]));
  return sortByName(rows, (row) => row.name).map(toProject);
}

export async function getProject(db: Database, userId: string, id: string): Promise<Project> {
  return toProject(await requireProject(db, userId, id));
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
  return toProject(row);
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
  const [row] = await db
    .update(projects)
    .set({ name, color: changes.color, archivedAt, updatedAt: now })
    .where(eq(projects.id, id))
    .returning();
  if (row === undefined) throw new Error(`Project ${id} was not updated`);
  return toProject(row);
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
  const active = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.archivedAt)));
  const key = nameKey(name);
  if (active.some((project) => project.id !== exceptId && nameKey(project.name) === key)) {
    throw nameTaken();
  }
}

function nameKey(name: string): string {
  return name.toLowerCase();
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
