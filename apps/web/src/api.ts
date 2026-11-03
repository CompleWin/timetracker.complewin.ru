import {
  activeSessionsResponse,
  notionConnectionResponse,
  projectResponse,
  projectsResponse,
  sessionResponse,
  sessionsResponse,
  TASK_SESSIONS_MAX_LIMIT,
  taskResponse,
  tasksResponse,
  userResponse,
  type ActiveSession,
  type ArchivedFilter,
  type CreateProjectBody,
  type CreateSessionBody,
  type CreateTaskBody,
  type DevLoginBody,
  type NotionConnection,
  type Project,
  type Session,
  type Task,
  type UpdateMeBody,
  type UpdateProjectBody,
  type UpdateSessionBody,
  type UpdateTaskBody,
  type User,
} from "@stt/shared";
import { z } from "zod";
import { markOffline, markOnline } from "./connection.ts";
import { rememberServerNow } from "./server-clock.ts";

const SERVER_NOW_HEADER = "X-Server-Now";

const healthResponse = z.object({ env: z.string() });

const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    details: z.object({ fields: z.record(z.string(), z.string()).optional() }).optional(),
  }),
});

type ErrorBody = {
  code: string | undefined;
  fields: string[];
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly fields: string[] = [],
  ) {
    super(`Request failed with status ${status}`);
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Network request failed", { cause });
  }
}

export function isApiError(error: unknown, code: string): boolean {
  return error instanceof HttpError && error.code === code;
}

export async function fetchEnvironment(): Promise<string> {
  return healthResponse.parse(await request("GET", "/api/health")).env;
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return userResponse.parse(await request("GET", "/api/me")).user;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return null;
    throw error;
  }
}

export async function devLogin(body: DevLoginBody = {}): Promise<User> {
  return userResponse.parse(await request("POST", "/auth/dev-login", body)).user;
}

export async function updateMe(body: UpdateMeBody): Promise<User> {
  return userResponse.parse(await request("PATCH", "/api/me", body)).user;
}

export async function logout(): Promise<void> {
  await request("POST", "/auth/logout");
}

export async function fetchProjects(archived: ArchivedFilter): Promise<Project[]> {
  const path = `/api/projects?${new URLSearchParams({ archived })}`;
  return projectsResponse.parse(await request("GET", path)).projects;
}

export async function createProject(body: CreateProjectBody): Promise<Project> {
  return projectResponse.parse(await request("POST", "/api/projects", body)).project;
}

export async function updateProject(id: string, body: UpdateProjectBody): Promise<Project> {
  return projectResponse.parse(await request("PATCH", `/api/projects/${id}`, body)).project;
}

export async function fetchTasks(archived: ArchivedFilter): Promise<Task[]> {
  const path = `/api/tasks?${new URLSearchParams({ archived })}`;
  return tasksResponse.parse(await request("GET", path)).tasks;
}

export async function createTask(body: CreateTaskBody): Promise<Task> {
  return taskResponse.parse(await request("POST", "/api/tasks", body)).task;
}

export async function fetchProject(id: string): Promise<Project> {
  return projectResponse.parse(await request("GET", `/api/projects/${id}`)).project;
}

export async function fetchTask(id: string): Promise<Task> {
  return taskResponse.parse(await request("GET", `/api/tasks/${id}`)).task;
}

export async function updateTask(id: string, body: UpdateTaskBody): Promise<Task> {
  return taskResponse.parse(await request("PATCH", `/api/tasks/${id}`, body)).task;
}

export async function fetchTaskSessions(taskId: string): Promise<Session[]> {
  const limit = String(TASK_SESSIONS_MAX_LIMIT);
  const path = `/api/tasks/${taskId}/sessions?${new URLSearchParams({ limit })}`;
  return sessionsResponse.parse(await request("GET", path)).sessions;
}

export async function createSession(taskId: string, body: CreateSessionBody): Promise<Session> {
  const path = `/api/tasks/${taskId}/sessions`;
  return sessionResponse.parse(await request("POST", path, body)).session;
}

export async function updateSession(id: string, body: UpdateSessionBody): Promise<Session> {
  return sessionResponse.parse(await request("PATCH", `/api/sessions/${id}`, body)).session;
}

export async function deleteSession(id: string): Promise<void> {
  await request("DELETE", `/api/sessions/${id}`);
}

export async function fetchActiveSessions(): Promise<ActiveSession[]> {
  return activeSessionsResponse.parse(await request("GET", "/api/timers/active")).sessions;
}

export async function startTimer(taskId: string): Promise<Session> {
  return sessionResponse.parse(await request("POST", `/api/tasks/${taskId}/start`)).session;
}

export async function stopTimer(taskId: string): Promise<Session> {
  return sessionResponse.parse(await request("POST", `/api/tasks/${taskId}/stop`)).session;
}

export async function fetchNotionConnection(): Promise<NotionConnection | null> {
  return notionConnectionResponse.parse(await request("GET", "/api/notion/connection")).connection;
}

export async function checkNotionConnection(): Promise<NotionConnection | null> {
  const path = "/api/notion/connection/check";
  return notionConnectionResponse.parse(await request("POST", path)).connection;
}

export async function disconnectNotion(): Promise<void> {
  await request("DELETE", "/api/notion/connection");
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const sentAtMs = Date.now();
  const response = await send(method, path, body);
  rememberServerNow(response.headers.get(SERVER_NOW_HEADER), sentAtMs, Date.now());
  if (!response.ok) {
    const { code, fields } = await errorBody(response);
    throw new HttpError(response.status, code, fields);
  }
  return response.status === 204 ? null : response.json();
}

async function send(method: string, path: string, body: unknown): Promise<Response> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    markOnline();
    return response;
  } catch (error) {
    markOffline();
    throw new NetworkError(error);
  }
}

async function errorBody(response: Response): Promise<ErrorBody> {
  const parsed = errorResponse.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) return { code: undefined, fields: [] };
  const { code, details } = parsed.data.error;
  return { code, fields: Object.keys(details?.fields ?? {}) };
}
