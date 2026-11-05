import { asc, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { tasks, timeEntries } from "../db/schema.ts";
import { forgetTaskLines } from "./page-links.ts";

export type PlacedPosition = "start" | "end";

export type TimeBlockLink = {
  calloutId: string;
  toggleId: string | null;
  position: PlacedPosition;
};

export type LoggedEntry = typeof timeEntries.$inferSelect;

export type PlacedLine = {
  entryId: string;
  blockId: string;
  content: string;
};

export function taskEntries(db: Database, taskId: string): Promise<LoggedEntry[]> {
  return db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.taskId, taskId))
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id));
}

export async function saveBlockLink(
  db: Database,
  taskId: string,
  link: TimeBlockLink,
): Promise<void> {
  await db.update(tasks).set({ notionBlock: link }).where(eq(tasks.id, taskId));
}

export async function forgetBlockLink(db: Database, taskId: string): Promise<void> {
  await db.batch([
    forgetTaskLines(db, taskId),
    db.update(tasks).set({ notionBlock: null }).where(eq(tasks.id, taskId)),
  ]);
}

export async function saveLines(db: Database, lines: PlacedLine[]): Promise<void> {
  const [first, ...rest] = lines.map(({ entryId, blockId, content }) =>
    db
      .update(timeEntries)
      .set({ notionBlockId: blockId, notionLine: content })
      .where(eq(timeEntries.id, entryId)),
  );
  if (first !== undefined) await db.batch([first, ...rest]);
}

export async function forgetLine(db: Database, entryId: string): Promise<void> {
  await db
    .update(timeEntries)
    .set({ notionBlockId: null, notionLine: null })
    .where(eq(timeEntries.id, entryId));
}
