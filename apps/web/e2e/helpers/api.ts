import { expect, type Page } from "@playwright/test";

export type ProjectColor =
  "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

export type Project = {
  id: string;
  name: string;
  color: ProjectColor;
  archived: boolean;
  archivedAt: string | null;
};

export type Task = {
  id: string;
  projectId: string | null;
  title: string;
  archived: boolean;
  archivedAt: string | null;
  pinned: boolean;
  runningSessionId: string | null;
};

export type Session = {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
  note: string;
};

export type CurrentUser = {
  botCanMessage: boolean;
  reminderThresholdMin: number;
};

export type ManualSessionInput = {
  startedAt: string;
  endedAt: string;
  note?: string;
};

type TaskChanges = Partial<Pick<Task, "title" | "projectId" | "archived" | "pinned">>;

type ApiRequest = {
  method: "GET" | "POST" | "PATCH";
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

export async function getTask(page: Page, taskId: string): Promise<Task> {
  const request: ApiRequest = { method: "GET", path: `/api/tasks/${taskId}` };
  const { task } = await requestFromPage<{ task: Task }>(page, request, 200);
  return task;
}

export async function listTasks(page: Page): Promise<Task[]> {
  const request: ApiRequest = { method: "GET", path: "/api/tasks" };
  const { tasks } = await requestFromPage<{ tasks: Task[] }>(page, request, 200);
  return tasks;
}

export function archiveTask(page: Page, taskId: string): Promise<Task> {
  return updateTask(page, taskId, { archived: true });
}

export function pinTask(page: Page, taskId: string): Promise<Task> {
  return updateTask(page, taskId, { pinned: true });
}

export async function archiveProject(page: Page, projectId: string): Promise<Project> {
  const request: ApiRequest = {
    method: "PATCH",
    path: `/api/projects/${projectId}`,
    body: { archived: true },
  };
  const { project } = await requestFromPage<{ project: Project }>(page, request, 200);
  return project;
}

export async function startTimer(page: Page, taskId: string): Promise<Session> {
  const request: ApiRequest = { method: "POST", path: `/api/tasks/${taskId}/start` };
  const { session } = await requestFromPage<{ session: Session }>(page, request, 201);
  return session;
}

export async function getSession(page: Page, sessionId: string): Promise<Session> {
  const request: ApiRequest = { method: "GET", path: `/api/sessions/${sessionId}` };
  const { session } = await requestFromPage<{ session: Session }>(page, request, 200);
  return session;
}

export async function activeTimers(page: Page): Promise<Session[]> {
  const request: ApiRequest = { method: "GET", path: "/api/timers/active" };
  const { sessions } = await requestFromPage<{ sessions: Session[] }>(page, request, 200);
  return sessions;
}

export async function taskSessions(page: Page, taskId: string): Promise<Session[]> {
  const request: ApiRequest = { method: "GET", path: `/api/tasks/${taskId}/sessions` };
  const { sessions } = await requestFromPage<{ sessions: Session[] }>(page, request, 200);
  return sessions;
}

export async function addSession(
  page: Page,
  taskId: string,
  input: ManualSessionInput,
): Promise<Session> {
  const request: ApiRequest = {
    method: "POST",
    path: `/api/tasks/${taskId}/sessions`,
    body: input,
  };
  const { session } = await requestFromPage<{ session: Session }>(page, request, 201);
  return session;
}

export async function setTimeZone(page: Page, timezone: string): Promise<void> {
  const request: ApiRequest = { method: "PATCH", path: "/api/me", body: { timezone } };
  await requestFromPage(page, request, 200);
}

export async function currentUser(page: Page): Promise<CurrentUser> {
  const request: ApiRequest = { method: "GET", path: "/api/me" };
  const { user } = await requestFromPage<{ user: CurrentUser }>(page, request, 200);
  return user;
}

export async function botUsername(page: Page): Promise<string> {
  const request: ApiRequest = { method: "GET", path: "/api/health" };
  const health = await requestFromPage<{ botUsername: string }>(page, request, 200);
  return health.botUsername;
}

export type PublisherContacts = {
  publisherName: string;
  supportEmail: string;
};

export async function publisherContacts(page: Page): Promise<PublisherContacts> {
  const request: ApiRequest = { method: "GET", path: "/api/health" };
  const { publisherName, supportEmail } = await requestFromPage<PublisherContacts>(
    page,
    request,
    200,
  );
  return { publisherName, supportEmail };
}

export async function listProjects(page: Page): Promise<Project[]> {
  const request: ApiRequest = { method: "GET", path: "/api/projects" };
  const { projects } = await requestFromPage<{ projects: Project[] }>(page, request, 200);
  return projects;
}

async function updateTask(page: Page, taskId: string, changes: TaskChanges): Promise<Task> {
  const request: ApiRequest = { method: "PATCH", path: `/api/tasks/${taskId}`, body: changes };
  const { task } = await requestFromPage<{ task: Task }>(page, request, 200);
  return task;
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
