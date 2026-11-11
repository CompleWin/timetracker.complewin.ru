import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { pickerTrigger } from "./helpers/picker.ts";
import { button, link, pageTitle, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const RUSSIAN_DESCRIPTION =
  "Простой трекер времени. Запускай таймеры по задачам и проектам с телефона и компьютера, смотри, куда ушло время, и держи его в Notion. Вход через Telegram, а бот напомнит о забытом таймере.";
const TRY_IT_FREE = "Попробовать бесплатно";

test("9. / без сессии показывает h1 «SimpleTimeTracker», описание и ссылку «Попробовать бесплатно», она ведёт на /login", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pageTitle(page, "SimpleTimeTracker")).toBeVisible();
  await expect(textOf(page, RUSSIAN_DESCRIPTION)).toBeVisible();

  await link(page, TRY_IT_FREE).click();

  await expect(page).toHaveURL(urlMatching("/login"));
});

test("9. после переключения на English на главной для гостя видна ссылка «Try it free»", async ({
  page,
}) => {
  await page.goto("/");

  await button(page, "English").click();

  await expect(link(page, "Try it free")).toBeVisible();
  await expect(link(page, TRY_IT_FREE)).toHaveCount(0);
});

test("10. / с сессией показывает трекер, а не главную для гостя", async ({ page }) => {
  await loginAs(page);

  await page.goto("/");

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pickerTrigger(page)).toBeVisible();
  await expect(link(page, TRY_IT_FREE)).toHaveCount(0);
});
