import { expect, test, type Locator, type Page } from "@playwright/test";
import { createTask, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import {
  isControlledByServiceWorker,
  reloadOnceServiceWorkerIsActive,
  SERVICE_WORKER_TEST_TIMEOUT_MS,
} from "./helpers/service-worker.ts";
import { button, runningNow, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type ButtonState = { enabled: boolean };

const OFFLINE_TEXT = "Нет соединения. Данные обновятся, когда сеть вернётся.";
const TITLES = ["Anki", "Беговая дорожка"];
const RECONNECT_TIMEOUT_MS = 10_000;

function offlineBanner(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: OFFLINE_TEXT });
}

async function openHomeUnderServiceWorker(page: Page): Promise<void> {
  await page.goto("/");
  await reloadOnceServiceWorkerIsActive(page);
  expect(await isControlledByServiceWorker(page)).toBe(true);
}

function countPageLoads(page: Page): () => number {
  let loads = 0;
  page.on("load", () => {
    loads += 1;
  });
  return () => loads;
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

test("11. запуск без сети: перезагрузка главной оставляет адрес / с баннером «Нет соединения…», после setOffline(false) без перезагрузки за 10 секунд баннер исчезает, видны задача и «Выйти»", async ({
  page,
  context,
}) => {
  test.setTimeout(SERVICE_WORKER_TEST_TIMEOUT_MS);
  const task = await createTask(page, { title: "Anki" });
  await openHomeUnderServiceWorker(page);
  await expect(textOf(page, task.title)).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(offlineBanner(page)).toBeVisible();
  await expect(page).toHaveURL(urlMatching("/"));

  const pageLoads = countPageLoads(page);
  await context.setOffline(false);

  const withinReconnect = { timeout: RECONNECT_TIMEOUT_MS };
  await expect(offlineBanner(page)).toBeHidden(withinReconnect);
  await expect(textOf(page, task.title)).toBeVisible(withinReconnect);
  await expect(button(page, "Выйти")).toBeVisible(withinReconnect);
  await expect(page).toHaveURL(urlMatching("/"));
  expect(pageLoads()).toBe(0);
});
