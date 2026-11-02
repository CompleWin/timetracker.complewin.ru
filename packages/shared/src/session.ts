import { z } from "zod";
import { atLeastOneField } from "./patch.ts";
import { isoDateTime } from "./time.ts";

export const MAX_RUNNING_TIMERS = 20;

export const SESSION_NOTE_MAX_LENGTH = 10_000;

export const TASK_SESSIONS_MAX_LIMIT = 200;

const TASK_SESSIONS_DEFAULT_LIMIT = 50;

export const sessionSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationSec: z.number(),
  note: z.string(),
});

export type Session = z.infer<typeof sessionSchema>;

export const activeSessionSchema = sessionSchema.extend({
  task: z.object({
    id: z.string(),
    title: z.string(),
    projectId: z.string().nullable(),
  }),
});

export type ActiveSession = z.infer<typeof activeSessionSchema>;

export const sessionResponse = z.object({ session: sessionSchema });

export const sessionsResponse = z.object({ sessions: z.array(sessionSchema) });

export const activeSessionsResponse = z.object({ sessions: z.array(activeSessionSchema) });

const sessionNote = z.string().max(SESSION_NOTE_MAX_LENGTH);

export const createSessionBody = z.object({
  startedAt: isoDateTime,
  endedAt: isoDateTime,
  note: sessionNote.default(""),
});

export type CreateSessionBody = z.input<typeof createSessionBody>;

export const updateSessionBody = atLeastOneField(
  z.object({
    note: sessionNote.optional(),
    startedAt: isoDateTime.optional(),
    endedAt: isoDateTime.optional(),
  }),
);

export type UpdateSessionBody = z.infer<typeof updateSessionBody>;

export const taskSessionsQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(TASK_SESSIONS_MAX_LIMIT)
    .default(TASK_SESSIONS_DEFAULT_LIMIT),
  before: isoDateTime.optional(),
});

export type TaskSessionsQuery = z.infer<typeof taskSessionsQuery>;
