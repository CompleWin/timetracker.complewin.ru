const CLOCK_START_MS = Date.parse("2030-01-01T00:00:00.000Z");
const SECOND_MS = 1_000;
const MINUTE_SEC = 60;
const HOUR_MIN = 60;

export function atSecond(second: number): { now: string } {
  return { now: new Date(CLOCK_START_MS + Math.round(second * SECOND_MS)).toISOString() };
}

export function atMinute(minute: number): { now: string } {
  return atSecond(minute * MINUTE_SEC);
}

export function clockIso(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return atMinute(hours * HOUR_MIN + minutes).now;
}

export function atClock(time: string): { now: string } {
  return { now: clockIso(time) };
}
