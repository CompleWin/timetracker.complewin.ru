import { expect, test } from "@playwright/test";
import { createTask, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { clockIn, expectClockTicks, readClockSec } from "./helpers/clock.ts";
import {
  expectPickerClosed,
  openPicker,
  startFromPicker,
  startTimerButton,
  stopTimerButton,
} from "./helpers/picker.ts";
import { button, region, runningNow, textOf } from "./helpers/ui.ts";

const ELAPSED_BEFORE_RELOAD_SEC = 2;
const ENGLISH_TRIGGER = "What are you doing? Pick a task and the timer starts right away";

test.describe("таймеры на русском", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test("18. «Запустить таймер: Anki» в панели выбора закрывает панель, в регионе «Сейчас идёт» видна «Anki» с идущими часами, «Остановить таймер: Anki» убирает регион", async ({
    page,
  }) => {
    await createTask(page, { title: "Anki" });
    await page.goto("/");
    await expect(runningNow(page)).toHaveCount(0);
    await openPicker(page);

    await startTimerButton(page, "Anki").click();

    await expectPickerClosed(page);
    const running = runningNow(page);
    await expect(textOf(running, "Anki")).toBeVisible();
    await expectClockTicks(clockIn(running));

    await stopTimerButton(running, "Anki").click();

    await expect(running).toHaveCount(0);
  });

  test("19. запущенные «Anki» и «Беговая дорожка» обе видны в регионе «Сейчас идут · 2»", async ({
    page,
  }) => {
    await createTask(page, { title: "Anki" });
    await createTask(page, { title: "Беговая дорожка" });
    await page.goto("/");

    await startFromPicker(page, "Anki");
    await startFromPicker(page, "Беговая дорожка");

    const running = region(page, "Сейчас идут · 2");
    for (const title of ["Anki", "Беговая дорожка"]) {
      await expect(textOf(running, title)).toBeVisible();
      await expect(stopTimerButton(running, title)).toBeVisible();
    }
  });

  test("20. после перезагрузки страницы идущий таймер остаётся в регионе «Сейчас идёт», часы показывают не меньше, чем до перезагрузки", async ({
    page,
  }) => {
    const task = await createTask(page, { title: "Anki" });
    await startTimer(page, task.id);
    await page.goto("/");
    const clockBeforeReload = clockIn(runningNow(page));
    await expect
      .poll(() => readClockSec(clockBeforeReload))
      .toBeGreaterThanOrEqual(ELAPSED_BEFORE_RELOAD_SEC);
    const shownBeforeReload = await readClockSec(clockBeforeReload);

    await page.reload();

    const running = runningNow(page);
    await expect(textOf(running, "Anki")).toBeVisible();
    await expect(clockIn(running)).toBeVisible();
    expect(await readClockSec(clockIn(running))).toBeGreaterThanOrEqual(shownBeforeReload);
  });
});

test("21. пользователь с locale en видит в панели выбора «Start timer: Anki», после запуска регион «Running now» и «Stop timer: Anki»", async ({
  page,
}) => {
  await loginAs(page, { locale: "en" });
  await createTask(page, { title: "Anki" });
  await page.goto("/");
  await openPicker(page, ENGLISH_TRIGGER);

  await button(page, "Start timer: Anki").click();

  const running = region(page, "Running now");
  await expect(running).toBeVisible();
  await expect(button(running, "Stop timer: Anki")).toBeVisible();
});
