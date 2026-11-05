import { expect, test, type Locator, type Page } from "@playwright/test";
import { openAccountMenu } from "./helpers/account-menu.ts";
import { createTask, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { pickerTrigger, stopTimerButton } from "./helpers/picker.ts";
import {
  isControlledByServiceWorker,
  reloadOnceServiceWorkerIsActive,
  SERVICE_WORKER_TEST_TIMEOUT_MS,
} from "./helpers/service-worker.ts";
import { button, runningNow, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type ButtonState = { enabled: boolean };

const OFFLINE_TEXT = "Нет соединения. Данные обновятся, когда сеть вернётся.";
const TITLE = "Anki";
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

async function openHomeWithRunningTimer(page: Page): Promise<void> {
  const task = await createTask(page, { title: TITLE });
  await startTimer(page, task.id);
  await page.goto("/");
  await expect(textOf(runningNow(page), TITLE)).toBeVisible();
}

async function expectButtons(buttons: Locator[], state: ButtonState): Promise<void> {
  for (const target of buttons) {
    await expect(target).toBeEnabled(state);
  }
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

test("8. при идущем таймере setOffline(true) показывает баннер «Нет соединения…» и выключает триггер панели выбора и «Остановить таймер: Anki», после setOffline(false) баннер исчезает, кнопки снова активны", async ({
  page,
  context,
}) => {
  await openHomeWithRunningTimer(page);
  const timerButtons = [pickerTrigger(page), stopTimerButton(runningNow(page), TITLE)];
  await expectButtons(timerButtons, { enabled: true });
  await expect(offlineBanner(page)).toBeHidden();

  await context.setOffline(true);

  await expect(offlineBanner(page)).toBeVisible();
  await expectButtons(timerButtons, { enabled: false });

  await context.setOffline(false);

  await expect(offlineBanner(page)).toBeHidden();
  await expectButtons(timerButtons, { enabled: true });
});

test("8. без сети «Добавить вручную» и «Сессия» в хронологии тоже неактивны", async ({
  page,
  context,
}) => {
  await openHomeWithRunningTimer(page);
  const sessionButtons = [button(page, "Добавить вручную"), button(page, "Сессия")];
  await expectButtons(sessionButtons, { enabled: true });

  await context.setOffline(true);

  await expect(offlineBanner(page)).toBeVisible();
  await expectButtons(sessionButtons, { enabled: false });
});

test("11. запуск без сети: перезагрузка главной оставляет адрес / с баннером «Нет соединения…», после setOffline(false) без перезагрузки за 10 секунд баннер исчезает, задача видна в «Сейчас идёт», в меню «Меню» есть «Выйти»", async ({
  page,
  context,
}) => {
  test.setTimeout(SERVICE_WORKER_TEST_TIMEOUT_MS);
  const task = await createTask(page, { title: TITLE });
  await startTimer(page, task.id);
  await openHomeUnderServiceWorker(page);
  await expect(textOf(runningNow(page), TITLE)).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(offlineBanner(page)).toBeVisible();
  await expect(page).toHaveURL(urlMatching("/"));

  const pageLoads = countPageLoads(page);
  await context.setOffline(false);

  const withinReconnect = { timeout: RECONNECT_TIMEOUT_MS };
  await expect(offlineBanner(page)).toBeHidden(withinReconnect);
  await expect(textOf(runningNow(page), TITLE)).toBeVisible(withinReconnect);
  await openAccountMenu(page);
  await expect(button(page, "Выйти")).toBeVisible();
  await expect(page).toHaveURL(urlMatching("/"));
  expect(pageLoads()).toBe(0);
});
