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

type LaneGroup = {
  endMs: number;
  laneEnds: number[];
};

const MS_PER_SECOND = 1000;

export function timelineLanes(items: TimelineItem[]): TimelineLane[] {
  const laneOf = new Map<string, { lane: number; group: LaneGroup }>();
  let group: LaneGroup = { endMs: -Infinity, laneEnds: [] };
  for (const item of byStart(items)) {
    if (group.endMs <= item.startMs) group = { endMs: item.endMs, laneEnds: [] };
    const free = group.laneEnds.findIndex((endMs) => endMs <= item.startMs);
    const lane = free === -1 ? group.laneEnds.length : free;
    group.laneEnds[lane] = item.endMs;
    group.endMs = Math.max(group.endMs, item.endMs);
    laneOf.set(item.id, { lane, group });
  }
  return items.map(({ id }) => {
    const placement = laneOf.get(id);
    return { id, lane: placement?.lane ?? 0, lanes: placement?.group.laneEnds.length ?? 1 };
  });
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

function byStart(items: TimelineItem[]): TimelineItem[] {
  return items.toSorted((a, b) => a.startMs - b.startMs || compareIds(a.id, b.id));
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
