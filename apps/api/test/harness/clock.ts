const CLOCK_START_MS = Date.parse("2030-01-01T00:00:00.000Z");
const MINUTE_MS = 60_000;

export function atMinute(minute: number): { now: string } {
  return { now: new Date(CLOCK_START_MS + minute * MINUTE_MS).toISOString() };
}
