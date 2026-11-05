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

export const sessionWithTaskSchema = sessionSchema.extend({
  task: z.object({
    id: z.string(),
    title: z.string(),
    projectId: z.string().nullable(),
  }),
});

export type SessionWithTask = z.infer<typeof sessionWithTaskSchema>;

export const sessionResponse = z.object({ session: sessionSchema });

export const sessionsResponse = z.object({ sessions: z.array(sessionSchema) });

export const sessionsWithTaskResponse = z.object({ sessions: z.array(sessionWithTaskSchema) });

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

export const SESSION_PERIOD_MAX_SEC = 31 * 24 * 60 * 60;

const MS_PER_SECOND = 1000;

export const sessionPeriodQuery = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
    taskId: z.string().optional(),
  })
  .refine(({ from, to }) => isValidPeriod(Date.parse(from), Date.parse(to)), {
    path: ["to"],
    message: "Must be later than from and at most 31 days after it",
  });

export type SessionPeriodQuery = z.infer<typeof sessionPeriodQuery>;

function isValidPeriod(fromMs: number, toMs: number): boolean {
  return toMs > fromMs && toMs - fromMs <= SESSION_PERIOD_MAX_SEC * MS_PER_SECOND;
}
