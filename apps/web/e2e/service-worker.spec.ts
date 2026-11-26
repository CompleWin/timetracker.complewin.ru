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

test("22. прямая навигация из PWA открывает robots.txt и sitemap.xml с исходными ответами", async ({
  page,
}) => {
  await reloadOnceServiceWorkerIsActive(page);
  expect(await isControlledByServiceWorker(page)).toBe(true);
  const origin = new URL(page.url()).origin;

  const robots = await page.goto("/robots.txt");
  expect(robots?.status()).toBe(200);
  expect(robots?.headers()["content-type"]).toMatch(/^text\/plain;\s*charset=utf-8$/i);
  expect((await robots?.text())?.trimEnd().split(/\r?\n/)).toEqual([
    "User-agent: *",
    "Disallow: /",
  ]);

  await page.goto("/");
  expect(await isControlledByServiceWorker(page)).toBe(true);

  const sitemap = await page.goto("/sitemap.xml");
  if (sitemap === null) throw new Error("Нет ответа для /sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toMatch(/^application\/xml;\s*charset=utf-8$/i);
  const urls = await page.evaluate(
    (body) => {
      const { documentElement } = new DOMParser().parseFromString(body, "application/xml");
      return {
        root: documentElement.localName,
        namespace: documentElement.namespaceURI,
        entries: Array.from(documentElement.children, (entry) => ({
          name: entry.localName,
          fields: Array.from(entry.children, (field) => ({
            name: field.localName,
            value: field.textContent,
          })),
        })),
      };
    },
    await sitemap.text(),
  );

  expect(urls).toEqual({
    root: "urlset",
    namespace: "http://www.sitemaps.org/schemas/sitemap/0.9",
    entries: ["/", "/ru", "/en", "/privacy", "/terms"].map((path) => ({
      name: "url",
      fields: [{ name: "loc", value: `${origin}${path}` }],
    })),
  });
});
