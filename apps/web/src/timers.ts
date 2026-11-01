import { elapsedSec, type ActiveSession } from "@stt/shared";

export function sessionsByTask(sessions: ActiveSession[]): Map<string, ActiveSession> {
  return new Map(sessions.map((session) => [session.taskId, session]));
}

export function liveTotalSec(totalSec: number, running: ActiveSession[], nowMs: number): number {
  return running.reduce((sum, session) => sum + secondsSinceLoaded(session, nowMs), totalSec);
}

function secondsSinceLoaded(session: ActiveSession, nowMs: number): number {
  return Math.max(0, elapsedSec(session.startedAt, nowMs) - session.durationSec);
}
