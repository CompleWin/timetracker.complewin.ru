import { expect, test } from "@playwright/test";

test("9. на странице / виден заголовок «SimpleTimeTracker»", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "SimpleTimeTracker", exact: true })).toBeVisible();
});
