import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth.ts";
import { expectInSection, heading, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const connectMessages = [
  ["notion_error=cancelled", "Подключение отменено"],
  ["notion_error=state", "Не удалось подключить Notion"],
  ["notion_error=token", "Не удалось подключить Notion"],
  ["notion=connected", "Notion подключён"],
] as const;

function connectNotion(page: Page): Locator {
  const name = "Подключить Notion";
  return page
    .getByRole("button", { name, exact: true })
    .or(page.getByRole("link", { name, exact: true }));
}

test("10. ссылка «Настройки» в шапке ведёт на /settings с разделом «Notion»", async ({ page }) => {
  await loginAs(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Настройки", exact: true }).click();

  await expect(page).toHaveURL(urlMatching("/settings"));
  await expect(heading(page, "Notion")).toBeVisible();
});

test("10. без подключения на /settings в разделе «Notion» видно «Notion не подключён» и «Подключить Notion»", async ({
  page,
}) => {
  await loginAs(page);
  await page.goto("/settings");

  await expect(textOf(page, "Notion не подключён")).toBeVisible();
  await expect(connectNotion(page)).toBeVisible();
  await expectInSection(page, "Notion", textOf(page, "Notion не подключён"));
  await expectInSection(page, "Notion", connectNotion(page));
});

for (const [query, message] of connectMessages) {
  test(`11. /settings?${query} показывает «${message}»`, async ({ page }) => {
    await loginAs(page);
    await page.goto(`/settings?${query}`);

    await expect(textOf(page, message)).toBeVisible();
  });
}
