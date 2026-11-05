import { formatSessionRange, formatTime, t, type Locale, type Session } from "@stt/shared";

export function sessionRange(session: Session, timeZone: string | null, locale: Locale): string {
  const { startedAt, endedAt } = session;
  if (endedAt !== null) return formatSessionRange(startedAt, endedAt, timeZone, locale);
  return t(locale, "sessions.runningRange", {
    start: formatTime(startedAt, timeZone),
    running: t(locale, "sessions.running"),
  });
}
