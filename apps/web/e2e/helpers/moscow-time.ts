export const MOSCOW_TIME_ZONE = "Europe/Moscow";

const MOSCOW_OFFSET = "+03:00";
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1_000;

export function moscowIso(localDateTime: string): string {
  return `${localDateTime}:00${MOSCOW_OFFSET}`;
}

export function moscowDate(iso: string): string {
  const moscow = moscowClock(iso);
  const day = twoDigits(moscow.getUTCDate());
  const month = twoDigits(moscow.getUTCMonth() + 1);
  return `${day}.${month}.${moscow.getUTCFullYear()}`;
}

export function moscowTime(iso: string): string {
  const moscow = moscowClock(iso);
  return `${twoDigits(moscow.getUTCHours())}:${twoDigits(moscow.getUTCMinutes())}`;
}

function moscowClock(iso: string): Date {
  return new Date(Date.parse(iso) + MOSCOW_OFFSET_MS);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
