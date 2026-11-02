import {
  fromDateTimeLocal,
  toDateTimeLocal,
  type MessageKey,
  type Session,
  type UpdateSessionBody,
} from "@stt/shared";
import { HttpError } from "./api.ts";

export type SessionForm = {
  start: string;
  end: string;
  note: string;
};

export type EditedSession = {
  startedAt: string;
  endedAt: string | null;
  note: string;
};

export type SessionFormErrors = {
  startedAt?: MessageKey;
  endedAt?: MessageKey;
  form?: MessageKey;
};

export function sessionForm(session: Session | undefined, timeZone: string | null): SessionForm {
  return {
    start: localValue(session?.startedAt ?? null, timeZone),
    end: localValue(session?.endedAt ?? null, timeZone),
    note: session?.note ?? "",
  };
}

export function editedTime(
  value: string,
  original: string | null,
  timeZone: string | null,
): string {
  if (original !== null && value === toDateTimeLocal(original, timeZone)) return original;
  return fromDateTimeLocal(value, timeZone);
}

export function endsAfterStart({ startedAt, endedAt }: EditedSession): boolean {
  return endedAt === null || Date.parse(endedAt) > Date.parse(startedAt);
}

export function sessionChanges(session: Session, edited: EditedSession): UpdateSessionBody {
  const changes: UpdateSessionBody = {};
  if (edited.startedAt !== session.startedAt) changes.startedAt = edited.startedAt;
  if (edited.endedAt !== null && edited.endedAt !== session.endedAt) {
    changes.endedAt = edited.endedAt;
  }
  if (edited.note !== session.note) changes.note = edited.note;
  return changes;
}

export function submitErrors(error: unknown): SessionFormErrors {
  if (!(error instanceof HttpError)) throw error;
  if (error.code === "overlap") return { form: "sessions.error.overlap" };
  if (error.code !== "validation_error") throw error;
  if (error.fields.includes("startedAt")) return { startedAt: "sessions.error.future" };
  if (error.fields.includes("endedAt")) return { endedAt: "sessions.error.future" };
  throw error;
}

function localValue(iso: string | null, timeZone: string | null): string {
  return iso === null ? "" : toDateTimeLocal(iso, timeZone);
}
