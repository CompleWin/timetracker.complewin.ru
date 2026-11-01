import { elapsedSec, type Session } from "@stt/shared";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { tasks, timeEntries } from "../db/schema.ts";

export type TimeEntryRow = typeof timeEntries.$inferSelect;

export type TaskTimer = {
  totalSec: number;
  runningSessionId: string | null;
};

export const IDLE_TIMER: TaskTimer = { totalSec: 0, runningSessionId: null };

export function toSession(row: TimeEntryRow, now: Date): Session {
  return {
    id: row.id,
    taskId: row.taskId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSec: elapsedSec(row.startedAt.toISOString(), (row.endedAt ?? now).getTime()),
  };
}

export function stopRunningEntries(db: Database, condition: SQL | undefined, now: Date) {
  return db
    .update(timeEntries)
    .set({ endedAt: sql`max(${timeEntries.startedAt}, ${now.getTime()})` })
    .where(and(condition, isNull(timeEntries.endedAt)))
    .returning();
}

export function stopTaskEntries(db: Database, userId: string, taskId: string, now: Date) {
  const taskEntries = and(eq(timeEntries.userId, userId), eq(timeEntries.taskId, taskId));
  return stopRunningEntries(db, taskEntries, now);
}

export function stopProjectEntries(db: Database, userId: string, projectId: string, now: Date) {
  const projectTasks = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  const projectEntries = and(
    eq(timeEntries.userId, userId),
    inArray(timeEntries.taskId, projectTasks),
  );
  return stopRunningEntries(db, projectEntries, now);
}

export async function taskTimers(
  db: Database,
  userId: string,
  now: Date,
  taskId?: string,
): Promise<Map<string, TaskTimer>> {
  const rows = await db
    .select({
      taskId: timeEntries.taskId,
      totalSec: totalSec(now),
      runningSessionId: entryIdWhere(isNull(timeEntries.endedAt)),
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        taskId === undefined ? undefined : eq(timeEntries.taskId, taskId),
      ),
    )
    .groupBy(timeEntries.taskId);
  return new Map(rows.map(({ taskId: id, ...timer }) => [id, timer]));
}

export async function projectTotals(
  db: Database,
  userId: string,
  now: Date,
  projectId?: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ projectId: tasks.projectId, totalSec: totalSec(now) })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(
      and(
        eq(timeEntries.userId, userId),
        projectId === undefined ? undefined : eq(tasks.projectId, projectId),
      ),
    )
    .groupBy(tasks.projectId);
  return new Map(
    rows.flatMap(({ projectId: id, totalSec }): [string, number][] =>
      id === null ? [] : [[id, totalSec]],
    ),
  );
}

export function entryIdWhere(condition: SQL): SQL<string | null> {
  return sql<string | null>`max(case when ${condition} then ${timeEntries.id} end)`;
}

function totalSec(now: Date): SQL<number> {
  const endedAt = sql`coalesce(${timeEntries.endedAt}, ${now.getTime()})`;
  const durationSec = sql`max(0, cast((${endedAt} - ${timeEntries.startedAt}) / 1000 as integer))`;
  return sql<number>`sum(${durationSec})`.mapWith(Number);
}
