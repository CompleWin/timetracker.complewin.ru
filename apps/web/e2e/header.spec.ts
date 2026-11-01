import { expect, test, type Page, type Response } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";

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

async function chooseEnglishInHeader(page: Page): Promise<void> {
  const saved = page.waitForResponse(savesLocale("en"));
  await page.getByLabel("Язык", { exact: true }).selectOption({ label: "English" });
  await saved;
}

test("24. выбор «English» в списке «Язык» меняет «Выйти» на «Sign out», язык сохраняется после перезагрузки", async ({
  page,
}) => {
  await loginAs(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();

  await chooseEnglishInHeader(page);

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByLabel("Language", { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByLabel("Language", { exact: true })).toBeVisible();
});
