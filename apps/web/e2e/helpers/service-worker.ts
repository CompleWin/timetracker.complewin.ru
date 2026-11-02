import { expect, type Page } from "@playwright/test";

const ACTIVATION_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MARGIN_MS = 30_000;

export const SERVICE_WORKER_TEST_TIMEOUT_MS = ACTIVATION_TIMEOUT_MS + TEST_TIMEOUT_MARGIN_MS;

async function hasActivatedServiceWorker(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === "activated";
  });
}

export async function reloadOnceServiceWorkerIsActive(page: Page): Promise<void> {
  await expect
    .poll(() => hasActivatedServiceWorker(page), {
      message: "service worker is activated",
      timeout: ACTIVATION_TIMEOUT_MS,
    })
    .toBe(true);
  await page.reload();
}

export async function isControlledByServiceWorker(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.serviceWorker.controller !== null);
}
