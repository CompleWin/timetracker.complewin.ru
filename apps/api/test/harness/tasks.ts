import { expect } from "vitest";
import { api, type TestResponse, type TestSession } from "./api.ts";
import { requireStatus, withQuery, type SessionOpts } from "./rest.ts";

export type TestTask = {
  id: string;
  projectId: string | null;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  totalSec: number;
  runningSessionId: string | null;
};

export type TaskInput = { title: string; projectId?: string | null };

export type TaskChanges = Partial<Pick<TestTask, "title" | "projectId" | "archived">>;

export function taskPath(id: string): string {
  return `/api/tasks/${id}`;
}

export async function createTask(
  session: TestSession,
  input: TaskInput,
  opts: SessionOpts = {},
): Promise<TestTask> {
  const response = await api.post("/api/tasks", input, { ...opts, as: session });
  return requireStatus(response, 201, "POST /api/tasks").body.task;
}

export async function updateTask(
  session: TestSession,
  id: string,
  changes: TaskChanges,
  opts: SessionOpts = {},
): Promise<TestTask> {
  const path = taskPath(id);
  const response = await api.patch(path, changes, { ...opts, as: session });
  return requireStatus(response, 200, `PATCH ${path}`).body.task;
}

export function getTask(
  session: TestSession,
  id: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(taskPath(id), { ...opts, as: session });
}

export function archiveTask(
  session: TestSession,
  id: string,
  opts?: SessionOpts,
): Promise<TestTask> {
  return updateTask(session, id, { archived: true }, opts);
}

export function listTasks(
  session: TestSession,
  query: Record<string, string> = {},
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(withQuery("/api/tasks", query), { ...opts, as: session });
}

export function expectTaskTitles(response: TestResponse, titles: string[]): void {
  expect(response).toMatchObject({
    status: 200,
    body: { tasks: titles.map((title) => ({ title })) },
  });
}
