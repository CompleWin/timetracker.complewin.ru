import { expect, test, type Locator, type Page } from "@playwright/test";
import { createTask, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { clockIn, readClockSec } from "./helpers/clock.ts";
import { button, region, textOf } from "./helpers/ui.ts";

const CLOCK_TICK_TIMEOUT_MS = 2_000;
const ELAPSED_BEFORE_RELOAD_SEC = 2;

function runningNow(page: Page): Locator {
  return region(page, "Сейчас идёт");
}

async function expectClockTicks(clock: Locator): Promise<void> {
  await expect(clock).toBeVisible();
  const shown = await clock.innerText();
  await expect(clock).not.toHaveText(shown, { timeout: CLOCK_TICK_TIMEOUT_MS });
}

test.describe("таймеры на русском", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test("18. «Запустить таймер: Anki» показывает «Anki» в панели «Сейчас идёт» с идущими часами, «Остановить таймер: Anki» убирает панель", async ({
    page,
  }) => {
    await createTask(page, { title: "Anki" });
    await page.goto("/");
    await expect(button(page, "Запустить таймер: Anki")).toBeVisible();
    await expect(runningNow(page)).toHaveCount(0);

    await button(page, "Запустить таймер: Anki").click();

    const panel = runningNow(page);
    await expect(textOf(panel, "Anki")).toBeVisible();
    await expectClockTicks(clockIn(panel));
    await expect(button(page, "Остановить таймер: Anki")).toHaveCount(2);

    await button(panel, "Остановить таймер: Anki").click();

    await expect(panel).toHaveCount(0);
    await expect(button(page, "Запустить таймер: Anki")).toBeVisible();
  });

  test("19. запущенные «Anki» и «Беговая дорожка» обе видны в панели «Сейчас идёт»", async ({
    page,
  }) => {
    await createTask(page, { title: "Anki" });
    await createTask(page, { title: "Беговая дорожка" });
    await page.goto("/");

    await button(page, "Запустить таймер: Anki").click();
    await button(page, "Запустить таймер: Беговая дорожка").click();

    const panel = runningNow(page);
    for (const title of ["Anki", "Беговая дорожка"]) {
      await expect(textOf(panel, title)).toBeVisible();
      await expect(button(panel, `Остановить таймер: ${title}`)).toBeVisible();
    }
  });

  test("20. после перезагрузки страницы идущий таймер остаётся в панели, часы показывают не меньше, чем до перезагрузки", async ({
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

    const panel = runningNow(page);
    await expect(textOf(panel, "Anki")).toBeVisible();
    await expect(clockIn(panel)).toBeVisible();
    expect(await readClockSec(clockIn(panel))).toBeGreaterThanOrEqual(shownBeforeReload);
  });
});

test("21. пользователь с locale en видит «Start timer: Anki», после запуска регион «Running now» и «Stop timer: Anki»", async ({
  page,
}) => {
  await loginAs(page, { locale: "en" });
  await createTask(page, { title: "Anki" });
  await page.goto("/");

  await button(page, "Start timer: Anki").click();

  const panel = region(page, "Running now");
  await expect(panel).toBeVisible();
  await expect(button(panel, "Stop timer: Anki")).toBeVisible();
});
