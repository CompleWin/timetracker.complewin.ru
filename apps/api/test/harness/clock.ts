const CLOCK_START_MS = Date.parse("2030-01-01T00:00:00.000Z");
const SECOND_MS = 1_000;
const MINUTE_SEC = 60;

export function atSecond(second: number): { now: string } {
  return { now: new Date(CLOCK_START_MS + Math.round(second * SECOND_MS)).toISOString() };
}

export function atMinute(minute: number): { now: string } {
  return atSecond(minute * MINUTE_SEC);
}
