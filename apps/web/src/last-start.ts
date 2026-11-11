import { formatDateTime, formatTime, t, type Locale } from "@stt/shared";
import { relativeDay } from "./day-sessions.ts";

export function lastStartText(
  lastStartedAt: string | null,
  nowMs: number,
  timeZone: string | null,
  locale: Locale,
): string {
  if (lastStartedAt === null) return t(locale, "tasks.neverStarted");
  const time = formatTime(lastStartedAt, timeZone);
  const relative = relativeDay(lastStartedAt, nowMs, timeZone);
  if (relative === "today") return t(locale, "tasks.lastToday", { time });
  if (relative === "yesterday") return t(locale, "tasks.lastYesterday", { time });
  const dateTime = formatDateTime(lastStartedAt, timeZone, locale);
  return t(locale, "tasks.lastAt", { dateTime });
}
