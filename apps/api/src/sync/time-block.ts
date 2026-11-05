import type { NotionBlockPosition } from "@stt/shared";
import { eq } from "drizzle-orm";
import { tasks } from "../db/schema.ts";
import {
  forgetBlockLink,
  forgetLine,
  saveBlockLink,
  saveLines,
  taskEntries,
  type LoggedEntry,
  type PlacedLine,
  type PlacedPosition,
  type TimeBlockLink,
} from "./block-links.ts";
import {
  appendBlocks,
  BlockGone,
  childBlockOfType,
  deleteBlock,
  updateBlock,
  type BlockSpec,
  type InsertPosition,
} from "./block-requests.ts";
import {
  lineContent,
  lineRichText,
  logLine,
  logTitle,
  plainRichText,
  summaryText,
  type FinishedSession,
  type LogLine,
  type Reader,
} from "./block-texts.ts";
import type { PushRun } from "./task-pages.ts";

const TIMER_EMOJI = String.fromCodePoint(0x23f1);
const MAX_CHILDREN_PER_APPEND = 100;

type BlockTask = {
  id: string;
  pageId: string;
  position: NotionBlockPosition;
  link: TimeBlockLink | null;
};

type FinishedEntry = LoggedEntry & FinishedSession;

type DesiredLine = {
  entry: FinishedEntry;
  line: LogLine;
};

export async function syncTimeBlock(run: PushRun, taskId: string): Promise<void> {
  const task = await loadBlockTask(run, taskId);
  if (task === undefined) return;
  const { position, link } = task;
  if (link !== null && link.position !== position) await removeBlock(run, task.id, link);
  else if (link !== null && (await refreshBlock(run, task, link))) return;
  if (position !== "none") await createBlock(run, task, position);
}

async function loadBlockTask(run: PushRun, taskId: string): Promise<BlockTask | undefined> {
  const row = await run.db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (row === undefined || row.notionPageId === null) return undefined;
  const database = run.databases.find(({ id }) => id === row.notionDatabaseId);
  return {
    id: row.id,
    pageId: row.notionPageId,
    position: row.notionBlockPosition ?? database?.blockPosition ?? "none",
    link: row.notionBlock,
  };
}

async function removeBlock(run: PushRun, taskId: string, link: TimeBlockLink): Promise<void> {
  await deleteBlock(run.client, link.calloutId);
  await forgetBlockLink(run.db, taskId);
}

async function refreshBlock(run: PushRun, task: BlockTask, link: TimeBlockLink): Promise<boolean> {
  try {
    await updateSummary(run, task, link.calloutId);
    await syncLines(run, task, await toggleOf(run, task, link));
    return true;
  } catch (error) {
    if (!(error instanceof BlockGone)) throw error;
    if (error.blockId === link.calloutId) await forgetBlockLink(run.db, task.id);
    else await removeBlock(run, task.id, link);
    return false;
  }
}

async function createBlock(run: PushRun, task: BlockTask, position: PlacedPosition): Promise<void> {
  const entries = await taskEntries(run.db, task.id);
  const callout = calloutSpec(reader(run), summary(run, entries));
  const [calloutId] = await appendBlocks(
    run.client,
    task.pageId,
    [callout],
    { type: position },
    true,
  );
  if (calloutId === undefined) throw new BlockGone(task.pageId);
  const link = { calloutId, toggleId: null, position };
  await saveBlockLink(run.db, task.id, link);
  await syncLines(run, task, await toggleOf(run, task, link));
}

async function updateSummary(run: PushRun, task: BlockTask, calloutId: string): Promise<void> {
  const entries = await taskEntries(run.db, task.id);
  const content = { rich_text: plainRichText(summary(run, entries)) };
  await updateBlock(run.client, calloutId, "callout", content);
}

async function toggleOf(run: PushRun, task: BlockTask, link: TimeBlockLink): Promise<string> {
  if (link.toggleId !== null) return link.toggleId;
  const toggleId = await childBlockOfType(run.client, link.calloutId, "toggle");
  await saveBlockLink(run.db, task.id, { ...link, toggleId });
  return toggleId;
}

async function syncLines(run: PushRun, task: BlockTask, toggleId: string): Promise<void> {
  const entries = await taskEntries(run.db, task.id);
  await removeStaleLines(run, entries);
  const desired = desiredLines(run, entries);
  await updateChangedLines(run, desired);
  await insertNewLines(run, toggleId, desired);
}

async function removeStaleLines(run: PushRun, entries: LoggedEntry[]): Promise<void> {
  for (const entry of entries) {
    if (entry.notionBlockId === null || isLogged(entry)) continue;
    await deleteBlock(run.client, entry.notionBlockId);
    await forgetLine(run.db, entry.id);
  }
}

async function updateChangedLines(run: PushRun, desired: DesiredLine[]): Promise<void> {
  for (const { entry, line } of desired) {
    const content = lineContent(line);
    if (entry.notionBlockId === null || entry.notionLine === content) continue;
    const richText = { rich_text: lineRichText(line) };
    await updateBlock(run.client, entry.notionBlockId, "bulleted_list_item", richText);
    await saveLines(run.db, [{ entryId: entry.id, blockId: entry.notionBlockId, content }]);
  }
}

async function insertNewLines(
  run: PushRun,
  toggleId: string,
  desired: DesiredLine[],
): Promise<void> {
  const logEmpty = desired.every(({ entry }) => entry.notionBlockId === null);
  let anchor: string | null = null;
  let pending: DesiredLine[] = [];
  for (const item of desired) {
    if (item.entry.notionBlockId === null) {
      pending.push(item);
      continue;
    }
    await insertAfter(run, toggleId, pending, anchor, logEmpty);
    pending = [];
    anchor = item.entry.notionBlockId;
  }
  await insertAfter(run, toggleId, pending, anchor, logEmpty);
}

async function insertAfter(
  run: PushRun,
  toggleId: string,
  lines: DesiredLine[],
  anchor: string | null,
  logEmpty: boolean,
): Promise<void> {
  let previous = anchor;
  for (let start = 0; start < lines.length; start += MAX_CHILDREN_PER_APPEND) {
    const batch = lines.slice(start, start + MAX_CHILDREN_PER_APPEND);
    const position = insertPosition(previous, logEmpty && start === 0);
    const ids = await appendLines(run, toggleId, batch, position);
    await saveLines(run.db, placedLines(batch, ids));
    previous = ids.at(-1) ?? previous;
  }
}

function placedLines(lines: DesiredLine[], blockIds: string[]): PlacedLine[] {
  return lines.flatMap(({ entry, line }, index) => {
    const blockId = blockIds[index];
    return blockId === undefined
      ? []
      : [{ entryId: entry.id, blockId, content: lineContent(line) }];
  });
}

async function appendLines(
  run: PushRun,
  toggleId: string,
  lines: DesiredLine[],
  position: InsertPosition | undefined,
): Promise<string[]> {
  try {
    return await appendBlocks(
      run.client,
      toggleId,
      lines.map(({ line }) => lineSpec(line)),
      position,
    );
  } catch (error) {
    if (error instanceof BlockGone && position?.type === "after_block") {
      throw new BlockGone(position.after_block.id);
    }
    throw error;
  }
}

function insertPosition(anchor: string | null, logEmpty: boolean): InsertPosition | undefined {
  if (anchor !== null) return { type: "after_block", after_block: { id: anchor } };
  return logEmpty ? undefined : { type: "start" };
}

function desiredLines(run: PushRun, entries: LoggedEntry[]): DesiredLine[] {
  return entries.filter(isLogged).map((entry) => ({ entry, line: logLine(reader(run), entry) }));
}

function isLogged(entry: LoggedEntry): entry is FinishedEntry {
  return entry.deletedAt === null && entry.endedAt !== null;
}

function summary(run: PushRun, entries: LoggedEntry[]): string {
  const live = entries.filter((entry) => entry.deletedAt === null);
  return summaryText(reader(run), live, run.now);
}

function reader(run: PushRun): Reader {
  return { locale: run.owner.locale, timeZone: run.owner.timeZone };
}

function calloutSpec(owner: Reader, text: string): BlockSpec {
  return {
    type: "callout",
    callout: {
      rich_text: plainRichText(text),
      icon: { type: "emoji", emoji: TIMER_EMOJI },
      color: "gray_background",
      children: [{ type: "toggle", toggle: { rich_text: plainRichText(logTitle(owner)) } }],
    },
  };
}

function lineSpec(line: LogLine): BlockSpec {
  return { type: "bulleted_list_item", bulleted_list_item: { rich_text: lineRichText(line) } };
}
