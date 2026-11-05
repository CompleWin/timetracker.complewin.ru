import { expect, test, type Page, type Response } from "@playwright/test";
import { openAccountMenu } from "./helpers/account-menu.ts";
import { loginAs } from "./helpers/auth.ts";
import { button, heading } from "./helpers/ui.ts";

function savesLocale(locale: string): (response: Response) => boolean {
  return (response) => {
    const request = response.request();
    return (
      request.method() === "PATCH" &&
      new URL(response.url()).pathname === "/api/me" &&
      request.postDataJSON()?.locale === locale
    );
  };
}

async function expectEnglishInterface(page: Page): Promise<void> {
  await expect(heading(page, "Language")).toBeVisible();
  await expect(button(page, "English")).toHaveAttribute("aria-pressed", "true");
  await openAccountMenu(page, "Menu");
  await expect(button(page, "Sign out")).toBeVisible();
  await expect(button(page, "Выйти")).toHaveCount(0);
}

test("24. «English» в разделе «Язык» на /settings получает aria-pressed, в меню «Menu» видно «Sign out», после перезагрузки интерфейс английский", async ({
  page,
}) => {
  await loginAs(page);
  await page.goto("/settings");
  await expect(heading(page, "Язык")).toBeVisible();
  await expect(button(page, "English")).toHaveAttribute("aria-pressed", "false");

  const saved = page.waitForResponse(savesLocale("en"));
  await button(page, "English").click();
  await saved;

  await expectEnglishInterface(page);

  await page.reload();

  await expectEnglishInterface(page);
});
