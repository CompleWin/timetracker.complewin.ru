import {
  elapsedSec,
  lastDays,
  toDateTimeLocal,
  type DayRange,
  type Project,
  type Session,
  type SessionWithTask,
  type TimelineItem,
} from "@stt/shared";

export type ProjectShare = {
  key: string;
  project: Project | null;
  seconds: number;
};

export type SessionDay<Item extends Session> = {
  key: string;
  startedAt: string;
  sessions: Item[];
};

export type RelativeDay = "today" | "yesterday";

const NO_PROJECT_KEY = "none";
const DATE_LENGTH = "2026-10-31".length;
const YEAR_LENGTH = "2026".length;

export function liveDurationSec(session: Session, nowMs: number): number {
  return session.endedAt === null ? elapsedSec(session.startedAt, nowMs) : session.durationSec;
}

export function startedIn<Item extends Session>(range: DayRange, sessions: Item[]): Item[] {
  return sessions.filter((session) => isWithin(session.startedAt, range));
}

export function groupByDay<Item extends Session>(
  sessions: Item[],
  timeZone: string | null,
): SessionDay<Item>[] {
  const days = new Map<string, SessionDay<Item>>();
  for (const session of sessions) {
    const key = localPrefix(session.startedAt, timeZone, DATE_LENGTH);
    const day = days.get(key) ?? { key, startedAt: session.startedAt, sessions: [] };
    days.set(key, { ...day, sessions: [...day.sessions, session] });
  }
  return [...days.values()];
}

export function relativeDay(
  iso: string,
  nowMs: number,
  timeZone: string | null,
): RelativeDay | undefined {
  const [yesterday, today] = lastDays(new Date(nowMs).toISOString(), timeZone, 2);
  if (today !== undefined && isWithin(iso, today)) return "today";
  if (yesterday !== undefined && isWithin(iso, yesterday)) return "yesterday";
  return undefined;
}

export function isCurrentYear(iso: string, nowMs: number, timeZone: string | null): boolean {
  const nowIso = new Date(nowMs).toISOString();
  return localPrefix(iso, timeZone, YEAR_LENGTH) === localPrefix(nowIso, timeZone, YEAR_LENGTH);
}

export function totalSec(sessions: Session[], nowMs: number): number {
  return sessions.reduce((sum, session) => sum + liveDurationSec(session, nowMs), 0);
}

export function secondsByTask(sessions: SessionWithTask[], nowMs: number): Map<string, number> {
  const seconds = new Map<string, number>();
  for (const session of sessions) {
    seconds.set(
      session.taskId,
      (seconds.get(session.taskId) ?? 0) + liveDurationSec(session, nowMs),
    );
  }
  return seconds;
}

export function timelineItems(sessions: SessionWithTask[], nowMs: number): TimelineItem[] {
  return sessions.map((session) => ({
    id: session.id,
    startMs: Date.parse(session.startedAt),
    endMs: session.endedAt === null ? nowMs : Date.parse(session.endedAt),
  }));
}

export function projectShares(
  sessions: SessionWithTask[],
  projects: Project[],
  nowMs: number,
): ProjectShare[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const shares = new Map<string, ProjectShare>();
  for (const session of sessions) {
    const project = byId.get(session.task.projectId ?? "") ?? null;
    const key = project?.id ?? NO_PROJECT_KEY;
    const share = shares.get(key) ?? { key, project, seconds: 0 };
    shares.set(key, { ...share, seconds: share.seconds + liveDurationSec(session, nowMs) });
  }
  return [...shares.values()].sort((a, b) => b.seconds - a.seconds);
}

function isWithin(iso: string, range: DayRange): boolean {
  const atMs = Date.parse(iso);
  return Date.parse(range.from) <= atMs && atMs < Date.parse(range.to);
}

function localPrefix(iso: string, timeZone: string | null, length: number): string {
  return toDateTimeLocal(iso, timeZone).slice(0, length);
}
