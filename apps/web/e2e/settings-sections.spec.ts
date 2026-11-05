import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { PHONE_VIEWPORT } from "./helpers/layout.ts";
import { heading, link } from "./helpers/ui.ts";

const SHORT_DESKTOP_VIEWPORT = { width: 1280, height: 400 };

function settingsSections(page: Page): Locator {
  return page.getByRole("navigation", { name: "Разделы настроек", exact: true });
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

test.describe("ширина окна 1280 px", () => {
  test.use({ viewport: SHORT_DESKTOP_VIEWPORT });

  test("16. без Notion в навигации «Разделы настроек» ссылки «Notion» и «Язык», текущая «Notion»; нажатие на «Язык» делает текущей её и показывает раздел «Язык»", async ({
    page,
  }) => {
    await page.goto("/settings");
    const sections = settingsSections(page);
    const notion = link(sections, "Notion");
    const language = link(sections, "Язык");

    await expect(sections.getByRole("link")).toHaveText(["Notion", "Язык"]);
    await expect(notion).toHaveAttribute("aria-current", "true");

    await language.click();

    await expect(language).toHaveAttribute("aria-current", "true");
    await expect(notion).not.toHaveAttribute("aria-current", "true");
    await expect(heading(page, "Язык")).toBeInViewport();
  });
});

test.describe("ширина окна 390 px", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("16. навигации «Разделы настроек» не видно", async ({ page }) => {
    await page.goto("/settings");

    await expect(heading(page, "Язык")).toBeVisible();
    await expect(settingsSections(page)).toBeHidden();
  });
});
