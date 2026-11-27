import { formatTime, type DayRange } from "@stt/shared";

export const HOUR_MS = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;

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

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
