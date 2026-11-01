import { expect, type Page } from "@playwright/test";

export type ProjectColor =
  "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

export type Project = {
  id: string;
  name: string;
  color: ProjectColor;
  archived: boolean;
};

export type Task = {
  id: string;
  projectId: string | null;
  title: string;
  archived: boolean;
};

type ApiRequest = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
};

type ApiResponse = {
  status: number;
  body: unknown;
};

export async function createProject(
  page: Page,
  input: { name: string; color?: ProjectColor },
): Promise<Project> {
  const request: ApiRequest = { method: "POST", path: "/api/projects", body: input };
  const { project } = await requestFromPage<{ project: Project }>(page, request, 201);
  return project;
}

export async function createTask(
  page: Page,
  input: { title: string; projectId?: string | null },
): Promise<Task> {
  const request: ApiRequest = { method: "POST", path: "/api/tasks", body: input };
  const { task } = await requestFromPage<{ task: Task }>(page, request, 201);
  return task;
}

export async function listProjects(page: Page): Promise<Project[]> {
  const request: ApiRequest = { method: "GET", path: "/api/projects" };
  const { projects } = await requestFromPage<{ projects: Project[] }>(page, request, 200);
  return projects;
}

async function requestFromPage<Body>(
  page: Page,
  request: ApiRequest,
  expectedStatus: number,
): Promise<Body> {
  const response = await page.evaluate(sendFromPage, request);
  expect(response.status, `${request.method} ${request.path}`).toBe(expectedStatus);
  return response.body as Body;
}

async function sendFromPage({ method, path, body }: ApiRequest): Promise<ApiResponse> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseBody: unknown = await response.json();
  return { status: response.status, body: responseBody };
}
