import type { Locale } from "./i18n/locale.ts";
import type { MessageKey } from "./i18n/messages.ts";
import { t } from "./i18n/t.ts";

export type DayRange = {
  from: string;
  to: string;
};

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const UTC = "UTC";
const MS_PER_MINUTE = 60_000;
const DAYS_PER_WEEK = 7;

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

const MONTH_LONG_KEYS = [
  "date.monthLong.1",
  "date.monthLong.2",
  "date.monthLong.3",
  "date.monthLong.4",
  "date.monthLong.5",
  "date.monthLong.6",
  "date.monthLong.7",
  "date.monthLong.8",
  "date.monthLong.9",
  "date.monthLong.10",
  "date.monthLong.11",
  "date.monthLong.12",
] as const satisfies readonly MessageKey[];

const WEEKDAY_KEYS = [
  "date.weekday.1",
  "date.weekday.2",
  "date.weekday.3",
  "date.weekday.4",
  "date.weekday.5",
  "date.weekday.6",
  "date.weekday.7",
] as const satisfies readonly MessageKey[];

const WEEKDAY_SHORT_KEYS = [
  "date.weekdayShort.1",
  "date.weekdayShort.2",
  "date.weekdayShort.3",
  "date.weekdayShort.4",
  "date.weekdayShort.5",
  "date.weekdayShort.6",
  "date.weekdayShort.7",
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

export function formatWeekdayDate(iso: string, timeZone: string | null, locale: Locale): string {
  const clock = wallClock(Date.parse(iso), timeZone);
  return t(locale, "date.weekdayDate", {
    weekday: t(locale, keyAt(WEEKDAY_KEYS, isoWeekday(clock))),
    dayMonth: dayMonthText(clock, locale),
  });
}

export function formatDayMonth(iso: string, timeZone: string | null, locale: Locale): string {
  return dayMonthText(wallClock(Date.parse(iso), timeZone), locale);
}

export function formatWeekdayShort(iso: string, timeZone: string | null, locale: Locale): string {
  return t(locale, keyAt(WEEKDAY_SHORT_KEYS, isoWeekday(wallClock(Date.parse(iso), timeZone))));
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

export function hourOf(iso: string, timeZone: string | null): number {
  return wallClock(Date.parse(iso), timeZone).hour;
}

export function lastDays(iso: string, timeZone: string | null, count: number): DayRange[] {
  const { year, month, day } = wallClock(Date.parse(iso), timeZone);
  return Array.from({ length: count }, (_, index) => {
    const dayNumber = day - (count - 1 - index);
    return {
      from: zonedMidnight(year, month, dayNumber, timeZone),
      to: zonedMidnight(year, month, dayNumber + 1, timeZone),
    };
  });
}

export function toDateTimeLocal(iso: string, timeZone: string | null): string {
  const clock = wallClock(Date.parse(iso), timeZone);
  return `${clock.year}-${twoDigits(clock.month)}-${twoDigits(clock.day)}T${clockText(clock)}`;
}

export function fromDateTimeLocal(value: string, timeZone: string | null): string {
  return new Date(zonedEpochMs(Date.parse(`${value}Z`), timeZone)).toISOString();
}

function zonedMidnight(year: number, month: number, day: number, timeZone: string | null): string {
  return new Date(zonedEpochMs(Date.UTC(year, month - 1, day), timeZone)).toISOString();
}

function zonedEpochMs(wallMs: number, timeZone: string | null): number {
  const firstGuessMs = wallMs - offsetMs(wallMs, timeZone);
  return wallMs - offsetMs(firstGuessMs, timeZone);
}

function isSameDay(first: string, second: string, timeZone: string | null): boolean {
  const a = wallClock(Date.parse(first), timeZone);
  const b = wallClock(Date.parse(second), timeZone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function isoWeekday({ year, month, day }: WallClock): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || DAYS_PER_WEEK;
}

function dayMonthText({ month, day }: WallClock, locale: Locale): string {
  return t(locale, "date.dayMonth", {
    dayNumber: day,
    monthLong: t(locale, keyAt(MONTH_LONG_KEYS, month)),
  });
}

function dateParams({ year, month, day }: WallClock, locale: Locale) {
  return {
    year,
    month: twoDigits(month),
    day: twoDigits(day),
    dayNumber: day,
    monthName: t(locale, keyAt(MONTH_KEYS, month)),
  };
}

function keyAt<Key extends MessageKey>(keys: readonly Key[], position: number): Key {
  const key = keys[position - 1];
  if (key === undefined) throw new RangeError(`No message key at position ${position}`);
  return key;
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
