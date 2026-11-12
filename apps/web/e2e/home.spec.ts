import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { RUSSIAN_HEADLINE } from "./helpers/landing.ts";
import { pageTitle } from "./helpers/ui.ts";

const APP_NAME = "SimpleTimeTracker";

test("9. у вошедшего на / виден заголовок h1 «SimpleTimeTracker»", async ({ page }) => {
  await loginAs(page);

  await page.goto("/");

  await expect(pageTitle(page, APP_NAME)).toBeVisible();
});

test("9. у гостя на / нет заголовка h1 «SimpleTimeTracker»", async ({ page }) => {
  await page.goto("/");

  await expect(pageTitle(page, RUSSIAN_HEADLINE)).toBeVisible();
  await expect(pageTitle(page, APP_NAME)).toHaveCount(0);
});
