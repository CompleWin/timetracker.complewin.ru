import {
  elapsedSec,
  type DayRange,
  type Project,
  type SessionWithTask,
  type TimelineItem,
} from "@stt/shared";

export type ProjectShare = {
  key: string;
  project: Project | null;
  seconds: number;
};

const NO_PROJECT_KEY = "none";

export function liveDurationSec(session: SessionWithTask, nowMs: number): number {
  return session.endedAt === null ? elapsedSec(session.startedAt, nowMs) : session.durationSec;
}

export function startedIn(range: DayRange, sessions: SessionWithTask[]): SessionWithTask[] {
  const fromMs = Date.parse(range.from);
  const toMs = Date.parse(range.to);
  return sessions.filter((session) => {
    const startMs = Date.parse(session.startedAt);
    return fromMs <= startMs && startMs < toMs;
  });
}

export function totalSec(sessions: SessionWithTask[], nowMs: number): number {
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
