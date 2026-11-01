import type { Locale } from "./i18n/locale.ts";
import { t } from "./i18n/t.ts";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MS_PER_SECOND = 1000;

type DurationParts = {
  hours: number;
  minutes: number;
  seconds: number;
};

export function formatDuration(sec: number, locale: Locale): string {
  const { hours, minutes } = durationParts(sec);
  if (hours === 0) return t(locale, "duration.minutes", { minutes });
  if (minutes === 0) return t(locale, "duration.hours", { hours });
  return t(locale, "duration.hoursMinutes", { hours, minutes });
}

export function formatClock(sec: number): string {
  const { hours, minutes, seconds } = durationParts(sec);
  return `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

export function elapsedSec(startedAt: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(startedAt)) / MS_PER_SECOND));
}

function durationParts(sec: number): DurationParts {
  if (!Number.isFinite(sec) || sec < 0) {
    throw new RangeError(`Expected a non-negative number of seconds, got ${sec}`);
  }
  const whole = Math.floor(sec);
  return {
    hours: Math.floor(whole / SECONDS_PER_HOUR),
    minutes: Math.floor((whole % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    seconds: whole % SECONDS_PER_MINUTE,
  };
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
