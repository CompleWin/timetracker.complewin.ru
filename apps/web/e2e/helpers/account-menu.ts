import { expect, type Locator, type Page } from "@playwright/test";
import { button, link } from "./ui.ts";

export function menuButton(page: Page, name = "Меню"): Locator {
  return button(page, name);
}

export async function openAccountMenu(page: Page, name = "Меню"): Promise<void> {
  const trigger = menuButton(page, name);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

export function accountMenu(page: Page): Locator {
  return page
    .locator("*")
    .filter({ has: link(page, "Архив") })
    .filter({ has: button(page, "Выйти") })
    .last();
}

export async function goToSection(page: Page, section: string): Promise<void> {
  await openAccountMenu(page);
  await link(accountMenu(page), section).click();
}
