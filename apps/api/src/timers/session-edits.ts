import type { Session, UpdateSessionBody } from "@stt/shared";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { timeEntries } from "../db/schema.ts";
import { notFound, overlap, validationError, type FieldErrors } from "../http/errors.ts";
import { requireActiveTask } from "../tasks/tasks.ts";
import { liveEntries, ownEntry, requireEntry, stoppedAt, toSession } from "./time-entries.ts";

export type ManualSession = {
  startedAt: string;
  endedAt: string;
  note: string;
};

type SessionTimes = {
  startedAt: Date;
  endedAt: Date | null;
};

type TimeChanges = {
  startedAt?: Date;
  endedAt?: Date;
};

const IN_FUTURE = "Must not be later than now";
const NOT_AFTER_START = "Must be later than startedAt";

export async function addSession(
  db: Database,
  userId: string,
  taskId: string,
  { note, ...interval }: ManualSession,
  now: Date,
): Promise<Session> {
  await requireActiveTask(db, userId, taskId);
  const times = { startedAt: new Date(interval.startedAt), endedAt: new Date(interval.endedAt) };
  ensureValidTimes(times, times, now);
  await ensureNoOverlap(db, taskId, times);
  const [row] = await db
    .insert(timeEntries)
    .values({ id: crypto.randomUUID(), userId, taskId, ...times, note })
    .returning();
  if (row === undefined) throw new Error(`Session of task ${taskId} was not added`);
  return toSession(row, now);
}

export async function updateSession(
  db: Database,
  userId: string,
  id: string,
  { note, startedAt, endedAt }: UpdateSessionBody,
  now: Date,
): Promise<Session> {
  const current = await requireEntry(db, userId, id);
  const changes = { startedAt: optionalDate(startedAt), endedAt: optionalDate(endedAt) };
  const times = {
    startedAt: changes.startedAt ?? current.startedAt,
    endedAt: changes.endedAt ?? current.endedAt,
  };
  ensureValidTimes(times, changes, now);
  await ensureNoOverlap(db, current.taskId, times, id);
  const [row] = await db
    .update(timeEntries)
    .set({ ...changes, note })
    .where(ownEntry(userId, id))
    .returning();
  if (row === undefined) throw notFound();
  return toSession(row, now);
}

export async function deleteSession(
  db: Database,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const [row] = await db
    .update(timeEntries)
    .set({ deletedAt: now, endedAt: sql`coalesce(${timeEntries.endedAt}, ${stoppedAt(now)})` })
    .where(ownEntry(userId, id))
    .returning({ id: timeEntries.id });
  if (row === undefined) throw notFound();
}

function ensureValidTimes(times: SessionTimes, changes: TimeChanges, now: Date): void {
  const errors = timeErrors(times, changes, now);
  if (Object.keys(errors).length > 0) throw validationError(errors);
}

function timeErrors(
  { startedAt, endedAt }: SessionTimes,
  changes: TimeChanges,
  now: Date,
): FieldErrors {
  const errors: FieldErrors = {};
  if (isAfter(changes.startedAt, now)) errors.startedAt = IN_FUTURE;
  if (isAfter(changes.endedAt, now)) errors.endedAt = IN_FUTURE;
  else if (endedAt !== null && endedAt <= startedAt) errors.endedAt = NOT_AFTER_START;
  return errors;
}

async function ensureNoOverlap(
  db: Database,
  taskId: string,
  { startedAt, endedAt }: SessionTimes,
  exceptId?: string,
): Promise<void> {
  const [blocking] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.taskId, taskId),
        liveEntries,
        exceptId === undefined ? undefined : ne(timeEntries.id, exceptId),
        endedAt === null ? undefined : lt(timeEntries.startedAt, endedAt),
        or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, startedAt)),
      ),
    )
    .limit(1);
  if (blocking !== undefined) throw overlap(blocking.id);
}

function isAfter(time: Date | undefined, now: Date): boolean {
  return time !== undefined && time > now;
}

function optionalDate(iso: string | undefined): Date | undefined {
  return iso === undefined ? undefined : new Date(iso);
}
