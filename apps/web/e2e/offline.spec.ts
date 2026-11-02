import { expect, test, type Locator, type Page } from "@playwright/test";
import { createTask, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { button, runningNow } from "./helpers/ui.ts";

type ButtonState = { enabled: boolean };

const OFFLINE_TEXT = "Нет соединения. Данные обновятся, когда сеть вернётся.";
const TITLES = ["Anki", "Беговая дорожка"];

function offlineBanner(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: OFFLINE_TEXT });
}

async function expectStartButtons(page: Page, state: ButtonState): Promise<void> {
  for (const title of TITLES) {
    await expect(button(page, `Запустить таймер: ${title}`)).toBeEnabled(state);
  }
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

test("8. setOffline(true) показывает баннер «Нет соединения…» и выключает кнопки «Запустить таймер: …», после setOffline(false) баннер исчезает", async ({
  page,
  context,
}) => {
  for (const title of TITLES) {
    await createTask(page, { title });
  }
  await page.goto("/");
  await expectStartButtons(page, { enabled: true });
  await expect(offlineBanner(page)).toBeHidden();

  await context.setOffline(true);

  await expect(offlineBanner(page)).toBeVisible();
  await expectStartButtons(page, { enabled: false });

  await context.setOffline(false);

  await expect(offlineBanner(page)).toBeHidden();
  await expectStartButtons(page, { enabled: true });
});

test("8. без сети кнопка «Остановить таймер: …» в панели «Сейчас идёт» тоже неактивна", async ({
  page,
  context,
}) => {
  const task = await createTask(page, { title: "Anki" });
  await startTimer(page, task.id);
  await page.goto("/");
  const stop = button(runningNow(page), "Остановить таймер: Anki");
  await expect(stop).toBeEnabled();

  await context.setOffline(true);

  await expect(offlineBanner(page)).toBeVisible();
  await expect(stop).toBeDisabled();
});
