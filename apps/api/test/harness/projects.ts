import { expect } from "vitest";
import { api, type TestResponse, type TestSession } from "./api.ts";
import { requireStatus, withQuery, type SessionOpts } from "./rest.ts";

export const PROJECT_COLORS = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

export type TestProject = {
  id: string;
  name: string;
  color: ProjectColor;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  totalSec: number;
  notionDatabaseId: string | null;
  archivedAt: string | null;
};

export type ProjectInput = {
  name: string;
  color?: ProjectColor;
  notionDatabaseId?: string | null;
};

export type ProjectChanges = Partial<
  Pick<TestProject, "name" | "color" | "archived" | "notionDatabaseId">
>;

export function projectPath(id: string): string {
  return `/api/projects/${id}`;
}

export async function createProject(
  session: TestSession,
  input: ProjectInput,
  opts: SessionOpts = {},
): Promise<TestProject> {
  const response = await api.post("/api/projects", input, { ...opts, as: session });
  return requireStatus(response, 201, "POST /api/projects").body.project;
}

export async function updateProject(
  session: TestSession,
  id: string,
  changes: ProjectChanges,
  opts: SessionOpts = {},
): Promise<TestProject> {
  const path = projectPath(id);
  const response = await api.patch(path, changes, { ...opts, as: session });
  return requireStatus(response, 200, `PATCH ${path}`).body.project;
}

export function getProject(
  session: TestSession,
  id: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(projectPath(id), { ...opts, as: session });
}

export function archiveProject(
  session: TestSession,
  id: string,
  opts?: SessionOpts,
): Promise<TestProject> {
  return updateProject(session, id, { archived: true }, opts);
}

export async function createArchivedProject(
  session: TestSession,
  name: string,
  opts?: SessionOpts,
): Promise<TestProject> {
  const project = await createProject(session, { name }, opts);
  return archiveProject(session, project.id, opts);
}

export function listProjects(
  session: TestSession,
  query: Record<string, string> = {},
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(withQuery("/api/projects", query), { ...opts, as: session });
}

export function expectProjectNames(response: TestResponse, names: string[]): void {
  expect(response).toMatchObject({
    status: 200,
    body: { projects: names.map((name) => ({ name })) },
  });
}
