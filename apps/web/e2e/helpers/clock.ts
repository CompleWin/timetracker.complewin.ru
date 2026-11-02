import { expect, type Locator } from "@playwright/test";

const CLOCK_TEXT = /^\d+:\d{2}:\d{2}$/;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const CLOCK_TICK_TIMEOUT_MS = 2_000;

export function clockIn(scope: Locator): Locator {
  return scope.getByText(CLOCK_TEXT);
}

export async function readClockSec(clock: Locator): Promise<number> {
  const text = await clock.innerText();
  const [hours = 0, minutes = 0, seconds = 0] = text.trim().split(":").map(Number);
  return hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + seconds;
}

export async function expectClockTicks(clock: Locator): Promise<void> {
  await expect(clock).toBeVisible();
  const shown = await clock.innerText();
  await expect(clock).not.toHaveText(shown, { timeout: CLOCK_TICK_TIMEOUT_MS });
}
