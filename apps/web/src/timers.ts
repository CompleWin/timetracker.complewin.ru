import { elapsedSec, type Session, type SessionWithTask } from "@stt/shared";
import { HttpError } from "./api.ts";

const CONFLICT_STATUS = 409;

export function sessionsByTask(sessions: SessionWithTask[]): Map<string, SessionWithTask> {
  return new Map(sessions.map((session) => [session.taskId, session]));
}

export function liveTotalSec(totalSec: number, running: Session[], nowMs: number): number {
  return running.reduce((sum, session) => sum + secondsSinceLoaded(session, nowMs), totalSec);
}

export async function changeTimer(change: () => Promise<unknown>): Promise<void> {
  try {
    await change();
  } catch (error) {
    if (!(error instanceof HttpError && error.status === CONFLICT_STATUS)) throw error;
  }
}

function secondsSinceLoaded(session: Session, nowMs: number): number {
  return Math.max(0, elapsedSec(session.startedAt, nowMs) - session.durationSec);
}
