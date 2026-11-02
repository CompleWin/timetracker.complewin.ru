import { expect, test as base, type Page } from "@playwright/test";
import { createTask } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { button, runningNow, textOf } from "./helpers/ui.ts";

type Trigger = {
  name: string;
  fire: (page: Page) => Promise<void>;
};

const TITLE = "Anki";
const REFRESH_TIMEOUT_MS = 3_000;

const visibilityChange: Trigger = {
  name: "событие visibilitychange",
  fire: (page) =>
    page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    }),
};

const windowFocus: Trigger = {
  name: "фокус окна",
  fire: (page) =>
    page.evaluate(() => {
      window.dispatchEvent(new FocusEvent("focus"));
    }),
};

const test = base.extend<{ secondDevice: Page }>({
  secondDevice: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(await context.newPage());
    await context.close();
  },
});

async function openHomeWithIdleTask(page: Page): Promise<void> {
  await page.goto("/");
  await expect(button(page, `Запустить таймер: ${TITLE}`)).toBeVisible();
  await expect(runningNow(page)).toHaveCount(0);
}

async function startFromUi(page: Page): Promise<void> {
  await button(page, `Запустить таймер: ${TITLE}`).click();
  await expect(textOf(runningNow(page), TITLE)).toBeVisible();
}

for (const trigger of [visibilityChange, windowFocus]) {
  test(`7. запуск таймера на первом устройстве, затем ${trigger.name} на втором: в течение 3 секунд второе показывает таймер в «Сейчас идёт»`, async ({
    page,
    secondDevice,
  }) => {
    const user = await loginAs(page);
    await loginAs(secondDevice, user);
    await createTask(page, { title: TITLE });
    await openHomeWithIdleTask(secondDevice);
    await openHomeWithIdleTask(page);

    await startFromUi(page);
    await trigger.fire(secondDevice);

    await expect(textOf(runningNow(secondDevice), TITLE)).toBeVisible({
      timeout: REFRESH_TIMEOUT_MS,
    });
  });
}
