import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import {
  isControlledByServiceWorker,
  reloadOnceServiceWorkerIsActive,
  SERVICE_WORKER_TEST_TIMEOUT_MS,
} from "./helpers/service-worker.ts";

test.describe.configure({ timeout: SERVICE_WORKER_TEST_TIMEOUT_MS });

async function healthRequestFails(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    try {
      await fetch("/api/health");
      return false;
    } catch {
      return true;
    }
  });
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
  await page.goto("/");
});

test("6. после загрузки и перезагрузки страницы navigator.serviceWorker.controller не null", async ({
  page,
}) => {
  await reloadOnceServiceWorkerIsActive(page);

  expect(await isControlledByServiceWorker(page)).toBe(true);
});

test("9. без сети fetch('/api/health') со страницы под service worker завершается ошибкой", async ({
  page,
  context,
}) => {
  await reloadOnceServiceWorkerIsActive(page);
  expect(await isControlledByServiceWorker(page)).toBe(true);
  expect(await healthRequestFails(page)).toBe(false);

  await context.setOffline(true);

  expect(await healthRequestFails(page)).toBe(true);
});
