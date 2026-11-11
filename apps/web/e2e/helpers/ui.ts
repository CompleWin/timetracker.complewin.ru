import { expect, type Locator, type Page } from "@playwright/test";

type Scope = Page | Locator;

export function button(scope: Scope, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

export function heading(scope: Scope, name: string): Locator {
  return scope.getByRole("heading", { name, exact: true });
}

export function pageTitle(page: Page, name: string): Locator {
  return page.getByRole("heading", { level: 1, name, exact: true });
}

export function link(scope: Scope, name: string): Locator {
  return scope.getByRole("link", { name, exact: true });
}

export function group(scope: Scope, name: string): Locator {
  return scope.getByRole("group", { name, exact: true });
}

export function field(scope: Scope, label: string): Locator {
  return scope.getByLabel(label, { exact: true });
}

export function island(page: Page, title: string): Locator {
  const otherHeadings = page.getByRole("heading").filter({ hasNotText: title });
  return page
    .locator("*")
    .filter({ has: heading(page, title) })
    .filter({ hasNot: otherHeadings })
    .first();
}

export function region(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

export function runningNow(page: Page): Locator {
  return region(page, "Сейчас идёт");
}

export function pageFooter(page: Page): Locator {
  return page.getByRole("contentinfo");
}

export function dialog(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name, exact: true });
}

export function menuItem(page: Page, name: string): Locator {
  return page
    .getByRole("menuitem", { name, exact: true })
    .or(page.getByRole("button", { name, exact: true }));
}

export function textOf(scope: Scope, text: string): Locator {
  return scope.getByText(text, { exact: true });
}

export async function expectInSection(
  page: Page,
  sectionTitle: string,
  item: Locator,
): Promise<void> {
  const innermostCommonContainer = page
    .locator("*")
    .filter({ has: heading(page, sectionTitle) })
    .filter({ has: item })
    .last();
  await expect(innermostCommonContainer.getByRole("heading")).toHaveCount(1);
}

export async function chooseRadio(scope: Locator, label: string): Promise<void> {
  await textOf(scope, label).click();
  await expect(scope.getByRole("radio", { name: label, exact: true })).toBeChecked();
}

export async function focusWithKeyboard(page: Page, target: Locator): Promise<void> {
  const maxPresses = 50;
  for (let press = 0; press < maxPresses; press++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Tab did not reach the element after ${maxPresses} presses`);
}
