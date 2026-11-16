import { SESSION_NOTE_MAX_LENGTH } from "@stt/shared";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "../db/client.ts";
import { timeEntries } from "../db/schema.ts";
import { liveEntries, stoppedAt, type TimeEntryRow } from "./time-entries.ts";

export const MERGE_GAP_MS = 60_000;

const NOTE_SEPARATOR = "\n";

export async function mergeNeighbours(
  db: Database,
  row: TimeEntryRow,
  now: Date,
): Promise<TimeEntryRow> {
  const chain = [await previousNeighbour(db, row), row, await nextNeighbour(db, row)].filter(
    (entry) => entry !== undefined,
  );
  const [head] = chain;
  const last = chain.at(-1);
  if (chain.length < 2 || head === undefined || last === undefined) return row;
  const note = mergedNote(chain);
  if (note.length > SESSION_NOTE_MAX_LENGTH) return row;
  const restIds = chain.slice(1).map(({ id }) => id);
  const [, merged] = await db.batch([
    db
      .update(timeEntries)
      .set({ deletedAt: now, endedAt: sql`coalesce(${timeEntries.endedAt}, ${stoppedAt(now)})` })
      .where(inArray(timeEntries.id, restIds)),
    db
      .update(timeEntries)
      .set({ endedAt: last.endedAt, note, remindedAt: last.remindedAt })
      .where(eq(timeEntries.id, head.id))
      .returning(),
  ]);
  const [mergedRow] = merged;
  if (mergedRow === undefined) throw new Error(`Session ${head.id} was not merged`);
  return mergedRow;
}

export async function resumeRecentSession(
  db: Database,
  taskId: string,
  now: Date,
): Promise<TimeEntryRow | undefined> {
  const [recent] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.taskId, taskId),
        liveEntries,
        lte(timeEntries.endedAt, now),
        gte(timeEntries.endedAt, new Date(now.getTime() - MERGE_GAP_MS)),
      ),
    )
    .orderBy(desc(timeEntries.endedAt))
    .limit(1);
  if (recent === undefined) return undefined;
  const [resumed] = await db
    .update(timeEntries)
    .set({ endedAt: null, remindedAt: null })
    .where(
      and(eq(timeEntries.id, recent.id), isNotNull(timeEntries.endedAt), noRunning(db, taskId)),
    )
    .returning();
  return resumed;
}

function noRunning(db: Database, taskId: string) {
  const running = alias(timeEntries, "running");
  return notExists(
    db
      .select({ id: running.id })
      .from(running)
      .where(and(eq(running.taskId, taskId), isNull(running.endedAt))),
  );
}

async function previousNeighbour(
  db: Database,
  row: TimeEntryRow,
): Promise<TimeEntryRow | undefined> {
  const [previous] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        sameTaskOthers(row),
        isNotNull(timeEntries.endedAt),
        lte(timeEntries.endedAt, row.startedAt),
        gte(timeEntries.endedAt, new Date(row.startedAt.getTime() - MERGE_GAP_MS)),
      ),
    )
    .orderBy(desc(timeEntries.endedAt))
    .limit(1);
  return previous;
}

async function nextNeighbour(db: Database, row: TimeEntryRow): Promise<TimeEntryRow | undefined> {
  if (row.endedAt === null) return undefined;
  const [next] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        sameTaskOthers(row),
        gte(timeEntries.startedAt, row.endedAt),
        lte(timeEntries.startedAt, new Date(row.endedAt.getTime() + MERGE_GAP_MS)),
      ),
    )
    .orderBy(asc(timeEntries.startedAt))
    .limit(1);
  return next;
}

function sameTaskOthers(row: TimeEntryRow) {
  return and(eq(timeEntries.taskId, row.taskId), liveEntries, ne(timeEntries.id, row.id));
}

function mergedNote(chain: TimeEntryRow[]): string {
  return chain
    .map(({ note }) => note)
    .filter((note) => note !== "")
    .join(NOTE_SEPARATOR);
}
