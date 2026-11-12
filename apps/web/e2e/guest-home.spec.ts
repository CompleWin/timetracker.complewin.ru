import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { pickerTrigger } from "./helpers/picker.ts";
import { link } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

test("10. / с сессией показывает трекер, а не главную для гостя", async ({ page }) => {
  await loginAs(page);

  await page.goto("/");

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(pickerTrigger(page)).toBeVisible();
  await expect(link(page, "Попробовать бесплатно")).toHaveCount(0);
});
