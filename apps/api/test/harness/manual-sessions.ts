import { expect } from "vitest";
import { api, type TestResponse, type TestSession } from "./api.ts";
import { expectApiError } from "./assertions.ts";
import { atClock, clockIso } from "./clock.ts";
import { requireStatus, type SessionOpts } from "./rest.ts";
import { taskPath } from "./tasks.ts";
import { getTaskSessions, getTimerSession, sessionPath, type TestTimerSession } from "./timers.ts";

export type SessionInterval = {
  startedAt: string;
  endedAt: string;
};

export type ManualSessionInput = SessionInterval & { note?: string };

export type SessionChanges = Partial<ManualSessionInput>;

export type StoredTimes = Pick<TestTimerSession, "id" | "startedAt" | "endedAt">;

export const MAX_NOTE_LENGTH = 10_000;

export const EVENING = atClock("20:00");

export function interval(start: string, end: string): SessionInterval {
  return { startedAt: clockIso(start), endedAt: clockIso(end) };
}

export function requestAddSession(
  session: TestSession,
  taskId: string,
  body: unknown,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.post(`${taskPath(taskId)}/sessions`, body, { ...opts, as: session });
}

export async function addSession(
  session: TestSession,
  taskId: string,
  input: ManualSessionInput,
  opts: SessionOpts = {},
): Promise<TestTimerSession> {
  const response = await requestAddSession(session, taskId, input, opts);
  return requireStatus(response, 201, `POST ${taskPath(taskId)}/sessions`).body.session;
}

export function requestEditSession(
  session: TestSession,
  id: string,
  body: unknown,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.patch(sessionPath(id), body, { ...opts, as: session });
}

export async function editSession(
  session: TestSession,
  id: string,
  changes: SessionChanges,
  opts: SessionOpts = {},
): Promise<TestTimerSession> {
  const response = await requestEditSession(session, id, changes, opts);
  return requireStatus(response, 200, `PATCH ${sessionPath(id)}`).body.session;
}

export function requestDeleteSession(
  session: TestSession,
  id: string,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.delete(sessionPath(id), { ...opts, as: session });
}

export async function deleteSession(
  session: TestSession,
  id: string,
  opts: SessionOpts = {},
): Promise<void> {
  const response = await requestDeleteSession(session, id, opts);
  requireStatus(response, 204, `DELETE ${sessionPath(id)}`);
}

export function expectOverlap(response: TestResponse, blocking: TestTimerSession): void {
  expectApiError(response, "overlap");
  expect(response.body).toMatchObject({ error: { details: { sessionId: blocking.id } } });
}

export async function expectTaskSessionIds(
  session: TestSession,
  taskId: string,
  expected: TestTimerSession[],
  opts: SessionOpts = {},
): Promise<void> {
  expect(await getTaskSessions(session, taskId, {}, opts)).toMatchObject({
    status: 200,
    body: { sessions: expected.map(({ id }) => ({ id })) },
  });
}

export async function expectStoredTimes(
  session: TestSession,
  { id, startedAt, endedAt }: StoredTimes,
  opts: SessionOpts = {},
): Promise<void> {
  expect(await getTimerSession(session, id, opts)).toMatchObject({
    status: 200,
    body: { session: { id, startedAt, endedAt } },
  });
}
