import type { Locale } from "./i18n/locale.ts";
import type { MessageKey } from "./i18n/messages.ts";
import { t } from "./i18n/t.ts";

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const UTC = "UTC";
const MS_PER_MINUTE = 60_000;

const MONTH_KEYS = [
  "date.month.1",
  "date.month.2",
  "date.month.3",
  "date.month.4",
  "date.month.5",
  "date.month.6",
  "date.month.7",
  "date.month.8",
  "date.month.9",
  "date.month.10",
  "date.month.11",
  "date.month.12",
] as const satisfies readonly MessageKey[];

const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(iso: string, timeZone: string | null, locale: Locale): string {
  return t(locale, "date.full", dateParams(wallClock(Date.parse(iso), timeZone), locale));
}

export function formatShortDate(iso: string, timeZone: string | null, locale: Locale): string {
  return t(locale, "date.short", dateParams(wallClock(Date.parse(iso), timeZone), locale));
}

export function formatTime(iso: string, timeZone: string | null): string {
  return clockText(wallClock(Date.parse(iso), timeZone));
}

export function formatDateTime(iso: string, timeZone: string | null, locale: Locale): string {
  return `${formatDate(iso, timeZone, locale)} ${formatTime(iso, timeZone)}`;
}

export function formatSessionRange(
  startedAt: string,
  endedAt: string,
  timeZone: string | null,
  locale: Locale,
): string {
  const start = formatTime(startedAt, timeZone);
  const end = formatTime(endedAt, timeZone);
  if (isSameDay(startedAt, endedAt, timeZone)) return `${start}–${end}`;
  return `${start}–${formatShortDate(endedAt, timeZone, locale)} ${end}`;
}

export function toDateTimeLocal(iso: string, timeZone: string | null): string {
  const clock = wallClock(Date.parse(iso), timeZone);
  return `${clock.year}-${twoDigits(clock.month)}-${twoDigits(clock.day)}T${clockText(clock)}`;
}

export function fromDateTimeLocal(value: string, timeZone: string | null): string {
  const wallMs = Date.parse(`${value}Z`);
  const firstGuessMs = wallMs - offsetMs(wallMs, timeZone);
  return new Date(wallMs - offsetMs(firstGuessMs, timeZone)).toISOString();
}

function isSameDay(first: string, second: string, timeZone: string | null): boolean {
  const a = wallClock(Date.parse(first), timeZone);
  const b = wallClock(Date.parse(second), timeZone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function dateParams({ year, month, day }: WallClock, locale: Locale) {
  return {
    year,
    month: twoDigits(month),
    day: twoDigits(day),
    dayNumber: day,
    monthName: monthName(month, locale),
  };
}

function monthName(month: number, locale: Locale): string {
  const key = MONTH_KEYS[month - 1];
  if (key === undefined) throw new RangeError(`Expected a month from 1 to 12, got ${month}`);
  return t(locale, key);
}

function offsetMs(epochMs: number, timeZone: string | null): number {
  const { year, month, day, hour, minute } = wallClock(epochMs, timeZone);
  const minuteStartMs = epochMs - (epochMs % MS_PER_MINUTE);
  return Date.UTC(year, month - 1, day, hour, minute) - minuteStartMs;
}

function wallClock(epochMs: number, timeZone: string | null): WallClock {
  const parts = formatterFor(timeZone ?? UTC).formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

function clockText({ hour, minute }: WallClock): string {
  return `${twoDigits(hour)}:${twoDigits(minute)}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
