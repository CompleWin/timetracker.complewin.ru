import { expect, test, type Locator, type Page } from "@playwright/test";
import { accountMenu, goToSection, menuButton, openAccountMenu } from "./helpers/account-menu.ts";
import { createTask } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { PHONE_VIEWPORT } from "./helpers/layout.ts";
import { button, link, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const ANDREY = { name: "Андрей", username: "andrey_k" };
const SECTIONS = ["Трекер", "Архив", "Настройки"];
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

async function expectCurrentSection(page: Page, current: string): Promise<void> {
  const menu = accountMenu(page);
  await expect(link(menu, current)).toHaveAttribute("aria-current", "page");
  for (const other of SECTIONS.filter((section) => section !== current)) {
    await expect(link(menu, other)).not.toHaveAttribute("aria-current", "page");
  }
}

function nameInMenuButton(page: Page): Locator {
  return textOf(menuButton(page), ANDREY.name);
}

test("16. в шапке ссылка «SimpleTimeTracker» на / и закрытое «Меню»; открытое меню показывает имя, вход через Telegram, разделы и «Выйти»; Esc закрывает его и возвращает фокус на «Меню»", async ({
  page,
}) => {
  await loginAs(page, ANDREY);
  await page.goto("/");
  await expect(link(page.getByRole("banner"), "SimpleTimeTracker")).toHaveAttribute("href", "/");
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");

  await openAccountMenu(page);

  const menu = accountMenu(page);
  await expect(textOf(menu, "Андрей")).toBeVisible();
  await expect(textOf(menu, "@andrey_k, вход через Telegram")).toBeVisible();
  for (const section of SECTIONS) {
    await expect(link(menu, section)).toBeVisible();
  }
  await expect(button(menu, "Выйти")).toBeVisible();
  await expectCurrentSection(page, "Трекер");

  await page.keyboard.press("Escape");

  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(button(page, "Выйти")).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
});

test("17. пункт «Архив» открывает /archive и закрывает меню, в снова открытом меню текущий раздел «Архив»", async ({
  page,
}) => {
  await loginAs(page, ANDREY);
  await page.goto("/");

  await goToSection(page, "Архив");

  await expect(page).toHaveURL(urlMatching("/archive"));
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  await openAccountMenu(page);
  await expectCurrentSection(page, "Архив");
});

test("17. на странице задачи текущий раздел в меню «Трекер»", async ({ page }) => {
  await loginAs(page, ANDREY);
  const task = await createTask(page, { title: "Anki" });
  await page.goto(`/tasks/${task.id}`);

  await openAccountMenu(page);

  await expectCurrentSection(page, "Трекер");
});

test("17. у пользователя без username в меню «Вход через Telegram»", async ({ page }) => {
  await loginAs(page, { name: ANDREY.name });
  await page.goto("/");

  await openAccountMenu(page);

  await expect(textOf(accountMenu(page), "Вход через Telegram")).toBeVisible();
});

test.describe("ширина окна 390 px", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("18. имени пользователя в кнопке «Меню» не видно", async ({ page }) => {
    await loginAs(page, ANDREY);
    await page.goto("/");

    await expect(menuButton(page)).toBeVisible();
    await expect(nameInMenuButton(page)).toBeHidden();
  });
});

test.describe("ширина окна 1280 px", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("18. имя пользователя видно в кнопке «Меню»", async ({ page }) => {
    await loginAs(page, ANDREY);
    await page.goto("/");

    await expect(nameInMenuButton(page)).toBeVisible();
  });
});
