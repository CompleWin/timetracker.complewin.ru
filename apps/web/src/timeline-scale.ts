import { formatTime, type DayRange, type TimelineItem } from "@stt/shared";

export const HOUR_MS = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;
const MORNING = "08:00";
const EVENING = "18:00";

type TimelineHour = { at: number; label: string };
type DayHours = [TimelineHour, ...TimelineHour[]];

export function timelineHours(day: DayRange, timeZone: string | null): DayHours {
  const from = Date.parse(day.from);
  const to = Date.parse(day.to);
  const midnightAtEndOffset = to - HOURS_PER_DAY * HOUR_MS;
  const hours: TimelineHour[] = [];
  for (const midnight of new Set([from, midnightAtEndOffset])) {
    for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
      const at = midnight + hour * HOUR_MS;
      const label = hourLabel(hour);
      if (at > from && at < to && formatTime(new Date(at).toISOString(), timeZone) === label) {
        hours.push({ at, label });
      }
    }
  }
  return [
    { at: from, label: formatTime(day.from, timeZone) },
    ...hours.sort((a, b) => a.at - b.at),
    { at: to, label: formatTime(day.to, timeZone) },
  ];
}

export function pastScaleHours(hours: DayHours, sessions: TimelineItem[]): TimelineHour[] {
  let firstStart = Infinity;
  let lastEnd = -Infinity;
  for (const session of sessions) {
    firstStart = Math.min(firstStart, session.startMs);
    lastEnd = Math.max(lastEnd, session.endMs);
  }
  const morning = hours.find((hour) => hour.label === MORNING)?.at ?? hours[0].at;
  const midnight = hours.at(-1)?.at ?? hours[0].at;
  const evening = hours.find((hour) => hour.label === EVENING)?.at ?? midnight;
  const start =
    sessions.length === 0
      ? morning
      : (hours.findLast((hour) => hour.at <= firstStart) ?? hours[0]).at;
  const end = hours.find((hour) => hour.at >= Math.max(evening, lastEnd))?.at ?? midnight;
  return hours.filter((hour) => hour.at >= start && hour.at <= end);
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
