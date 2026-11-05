import { hourOf } from "./dates.ts";

export type TimelineItem = {
  id: string;
  startMs: number;
  endMs: number;
};

export type TimelineLane = {
  id: string;
  lane: number;
  lanes: number;
};

export type TimelineGap = {
  startMs: number;
  endMs: number;
};

export type TimelineHours = {
  startHour: number;
  endHour: number;
};

const MS_PER_SECOND = 1000;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const HOURS_AFTER_NOW = 2;
const HOURS_PER_DAY = 24;

export function timelineLanes(items: TimelineItem[]): TimelineLane[] {
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();
  for (const item of byStart(items)) {
    const free = laneEnds.findIndex((endMs) => endMs <= item.startMs);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = item.endMs;
    laneOf.set(item.id, lane);
  }
  const lanes = (item: TimelineItem) =>
    Math.max(
      ...items
        .filter((other) => other === item || overlaps(item, other))
        .map((other) => (laneOf.get(other.id) ?? 0) + 1),
    );
  return items.map((item) => ({ id: item.id, lane: laneOf.get(item.id) ?? 0, lanes: lanes(item) }));
}

export function timelineGaps(items: TimelineItem[], minSec: number): TimelineGap[] {
  const gaps: TimelineGap[] = [];
  let coverMs: number | undefined;
  for (const item of byStart(items)) {
    if (coverMs !== undefined && item.startMs - coverMs >= minSec * MS_PER_SECOND) {
      gaps.push({ startMs: coverMs, endMs: item.startMs });
    }
    coverMs = Math.max(coverMs ?? item.endMs, item.endMs);
  }
  return gaps;
}

export function parallelSec(items: TimelineItem[]): number {
  const edges = items
    .flatMap((item) => [
      { atMs: item.startMs, change: 1 },
      { atMs: item.endMs, change: -1 },
    ])
    .sort((a, b) => a.atMs - b.atMs || a.change - b.change);
  let running = 0;
  let parallelMs = 0;
  let previousMs = 0;
  for (const edge of edges) {
    if (running >= 2) parallelMs += edge.atMs - previousMs;
    running += edge.change;
    previousMs = edge.atMs;
  }
  return Math.floor(parallelMs / MS_PER_SECOND);
}

export function timelineRange(
  firstStart: string | null,
  now: string,
  timeZone: string | null,
): TimelineHours {
  const firstHour = firstStart === null ? DAY_START_HOUR : hourOf(firstStart, timeZone);
  return {
    startHour: Math.min(DAY_START_HOUR, firstHour),
    endHour: Math.min(
      HOURS_PER_DAY,
      Math.max(DAY_END_HOUR, hourOf(now, timeZone) + HOURS_AFTER_NOW),
    ),
  };
}

function overlaps(a: TimelineItem, b: TimelineItem): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

function byStart(items: TimelineItem[]): TimelineItem[] {
  return items.toSorted((a, b) => a.startMs - b.startMs || compareIds(a.id, b.id));
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
