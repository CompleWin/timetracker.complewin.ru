import {
  MAX_RUNNING_TIMERS,
  type ActiveSession,
  type Session,
  type TaskSessionsQuery,
} from "@stt/shared";
import { and, asc, count, desc, eq, isNull, lt } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { tasks, timeEntries } from "../db/schema.ts";
import { alreadyRunning, notRunning, tooManyRunning } from "../http/errors.ts";
import { requireActiveTask, requireTask } from "../tasks/tasks.ts";
import {
  entryIdWhere,
  liveEntries,
  ownEntry,
  requireEntry,
  stopRunningEntries,
  stopTaskEntries,
  toSession,
} from "./time-entries.ts";

export async function startTimer(
  db: Database,
  userId: string,
  taskId: string,
  now: Date,
): Promise<Session> {
  await requireActiveTask(db, userId, taskId);
  await ensureCanStart(db, userId, taskId);
  const [row] = await db
    .insert(timeEntries)
    .values({ id: crypto.randomUUID(), userId, taskId, startedAt: now })
    .onConflictDoNothing()
    .returning();
  if (row !== undefined) return toSession(row, now);
  await ensureCanStart(db, userId, taskId);
  throw new Error(`Timer of task ${taskId} was not started`);
}

export async function stopTaskTimer(
  db: Database,
  userId: string,
  taskId: string,
  now: Date,
): Promise<Session> {
  const [row] = await stopTaskEntries(db, userId, taskId, now);
  if (row !== undefined) return toSession(row, now);
  await requireTask(db, userId, taskId);
  throw notRunning();
}

export async function stopSession(
  db: Database,
  userId: string,
  id: string,
  now: Date,
): Promise<Session> {
  const [row] = await stopRunningEntries(db, ownEntry(userId, id), now);
  if (row !== undefined) return toSession(row, now);
  await requireEntry(db, userId, id);
  throw notRunning();
}

export async function getSession(
  db: Database,
  userId: string,
  id: string,
  now: Date,
): Promise<Session> {
  return toSession(await requireEntry(db, userId, id), now);
}

export async function listActiveSessions(
  db: Database,
  userId: string,
  now: Date,
): Promise<ActiveSession[]> {
  const rows = await db
    .select({
      entry: timeEntries,
      task: { id: tasks.id, title: tasks.title, projectId: tasks.projectId },
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id));
  return rows.map(({ entry, task }) => ({ ...toSession(entry, now), task }));
}

export async function listTaskSessions(
  db: Database,
  userId: string,
  taskId: string,
  { limit, before }: TaskSessionsQuery,
  now: Date,
): Promise<Session[]> {
  await requireTask(db, userId, taskId);
  const rows = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.taskId, taskId),
        liveEntries,
        before === undefined ? undefined : lt(timeEntries.startedAt, new Date(before)),
      ),
    )
    .orderBy(desc(timeEntries.startedAt), desc(timeEntries.id))
    .limit(limit);
  return rows.map((row) => toSession(row, now));
}

async function ensureCanStart(db: Database, userId: string, taskId: string): Promise<void> {
  const [running] = await db
    .select({ count: count(), taskSessionId: entryIdWhere(eq(timeEntries.taskId, taskId)) })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)));
  if (running?.taskSessionId) throw alreadyRunning(running.taskSessionId);
  if ((running?.count ?? 0) >= MAX_RUNNING_TIMERS) throw tooManyRunning();
}
