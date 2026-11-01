import { api, type TestResponse, type TestSession } from "./api.ts";
import { atSecond } from "./clock.ts";
import { requireStatus, withQuery, type SessionOpts } from "./rest.ts";
import { loginAs } from "./session.ts";
import { createTask, taskPath, type TestTask } from "./tasks.ts";

export type TestTimerSession = {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
};

export type UserWithTask = {
  session: TestSession;
  task: TestTask;
};

export const MAX_RUNNING_TIMERS = 20;

export function sessionPath(id: string): string {
  return `/api/sessions/${id}`;
}

export function requestStart(
  session: TestSession,
  taskId: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.post(`${taskPath(taskId)}/start`, undefined, { ...opts, as: session });
}

export function requestStopTask(
  session: TestSession,
  taskId: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.post(`${taskPath(taskId)}/stop`, undefined, { ...opts, as: session });
}

export function requestStopSession(
  session: TestSession,
  sessionId: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.post(`${sessionPath(sessionId)}/stop`, undefined, { ...opts, as: session });
}

export function getTimerSession(
  session: TestSession,
  id: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(sessionPath(id), { ...opts, as: session });
}

export function getActiveTimers(
  session: TestSession,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get("/api/timers/active", { ...opts, as: session });
}

export function getTaskSessions(
  session: TestSession,
  taskId: string,
  query: Record<string, string> = {},
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(withQuery(`${taskPath(taskId)}/sessions`, query), { ...opts, as: session });
}

export async function startTimer(
  session: TestSession,
  taskId: string,
  opts: SessionOpts = {},
): Promise<TestTimerSession> {
  const response = await requestStart(session, taskId, opts);
  return requireStatus(response, 201, `POST ${taskPath(taskId)}/start`).body.session;
}

export async function stopTimer(
  session: TestSession,
  taskId: string,
  opts: SessionOpts = {},
): Promise<TestTimerSession> {
  const response = await requestStopTask(session, taskId, opts);
  return requireStatus(response, 200, `POST ${taskPath(taskId)}/stop`).body.session;
}

export async function recordSession(
  session: TestSession,
  taskId: string,
  startSecond: number,
  stopSecond: number,
): Promise<TestTimerSession> {
  await startTimer(session, taskId, atSecond(startSecond));
  return stopTimer(session, taskId, atSecond(stopSecond));
}

export async function loginWithTask(title = "Anki"): Promise<UserWithTask> {
  const { session } = await loginAs({}, atSecond(0));
  const task = await createTask(session, { title }, atSecond(0));
  return { session, task };
}
