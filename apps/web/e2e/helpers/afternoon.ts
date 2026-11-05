import type { Page } from "@playwright/test";
import { addSession, setTimeZone, type Session } from "./api.ts";
import { loginAs, type LoginOptions } from "./auth.ts";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const AFTERNOON_HOUR = 13;

const WEEKDAYS_RU = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];

const MONTHS_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export type AfternoonZone = {
  timezoneId: string;
  offsetHours: number;
};

export type LocalInterval = {
  start: string;
  end: string;
  daysAgo?: number;
};

export function afternoonZone(nowMs: number = Date.now()): AfternoonZone {
  const offsetHours = AFTERNOON_HOUR - new Date(nowMs).getUTCHours();
  return { timezoneId: etcZoneName(offsetHours), offsetHours };
}

export async function loginInZone(
  page: Page,
  zone: AfternoonZone,
  options: LoginOptions = {},
): Promise<void> {
  await loginAs(page, options);
  await setTimeZone(page, zone.timezoneId);
}

export function addLocalSession(
  page: Page,
  zone: AfternoonZone,
  taskId: string,
  { start, end, daysAgo = 0 }: LocalInterval,
): Promise<Session> {
  return addSession(page, taskId, {
    startedAt: localIso(zone, start, daysAgo),
    endedAt: localIso(zone, end, daysAgo),
  });
}

export function localIso(zone: AfternoonZone, time: string, daysAgo = 0): string {
  return `${localDate(zone, daysAgo)}T${time}:00${utcOffset(zone)}`;
}

export function localInput(zone: AfternoonZone, time: string): string {
  return `${localDate(zone)}T${time}`;
}

export function localTime(zone: AfternoonZone, iso: string): string {
  const local = inZone(zone, Date.parse(iso));
  return `${twoDigits(local.getUTCHours())}:${twoDigits(local.getUTCMinutes())}`;
}

export function localDateRu(zone: AfternoonZone, iso: string): string {
  const local = inZone(zone, Date.parse(iso));
  return `${dayAndMonth(local)}.${local.getUTCFullYear()}`;
}

export function shortDateRu(zone: AfternoonZone, daysAgo = 0): string {
  return dayAndMonth(localDay(zone, daysAgo));
}

export function weekdayDateRu(zone: AfternoonZone): string {
  const today = localDay(zone, 0);
  const weekday = WEEKDAYS_RU[today.getUTCDay()] ?? "";
  const month = MONTHS_RU[today.getUTCMonth()] ?? "";
  return `${weekday}, ${today.getUTCDate()} ${month}`;
}

function localDate(zone: AfternoonZone, daysAgo = 0): string {
  return localDay(zone, daysAgo).toISOString().slice(0, 10);
}

function localDay(zone: AfternoonZone, daysAgo: number): Date {
  return inZone(zone, Date.now() - daysAgo * DAY_MS);
}

function inZone(zone: AfternoonZone, utcMs: number): Date {
  return new Date(utcMs + zone.offsetHours * HOUR_MS);
}

function dayAndMonth(local: Date): string {
  return `${twoDigits(local.getUTCDate())}.${twoDigits(local.getUTCMonth() + 1)}`;
}

function etcZoneName(offsetHours: number): string {
  if (offsetHours === 0) return "Etc/GMT";
  const sign = offsetHours > 0 ? "-" : "+";
  return `Etc/GMT${sign}${Math.abs(offsetHours)}`;
}

function utcOffset({ offsetHours }: AfternoonZone): string {
  const sign = offsetHours < 0 ? "-" : "+";
  return `${sign}${twoDigits(Math.abs(offsetHours))}:00`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
