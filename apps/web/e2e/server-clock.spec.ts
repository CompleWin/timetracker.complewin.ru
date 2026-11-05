import { expect, test } from "@playwright/test";
import { createTask } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { clockIn, expectClockTicks, readClockSec } from "./helpers/clock.ts";
import { startFromPicker } from "./helpers/picker.ts";
import { runningNow } from "./helpers/ui.ts";

const HOUR_MS = 60 * 60 * 1_000;
const ONE_MINUTE_SEC = 60;

test("10. часы браузера на час впереди: у запущенного таймера в «Сейчас идёт» часы меньше 0:01:00, а не около 1:00:00", async ({
  page,
}) => {
  await page.clock.install({ time: Date.now() + HOUR_MS });
  await loginAs(page);
  await createTask(page, { title: "Anki" });
  await page.goto("/");

  await startFromPicker(page, "Anki");

  const clock = clockIn(runningNow(page));
  await expectClockTicks(clock);
  expect(await readClockSec(clock)).toBeLessThan(ONE_MINUTE_SEC);
});
