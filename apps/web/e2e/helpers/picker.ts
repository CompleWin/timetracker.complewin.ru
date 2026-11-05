import { expect, type Locator, type Page } from "@playwright/test";
import { button, group } from "./ui.ts";

type Scope = Page | Locator;

export const PICKER_TRIGGER = "Что делаешь? Выбери задачу, таймер пойдёт сразу";

const START_ROW = /^Запустить таймер: /;

export function pickerTrigger(page: Page, name = PICKER_TRIGGER): Locator {
  return button(page, name);
}

export function taskSearch(page: Page): Locator {
  return page.getByLabel("Поиск задач", { exact: true });
}

export function projectTree(page: Page): Locator {
  return group(page, "Проекты и задачи");
}

export function foundTasks(page: Page): Locator {
  return group(page, "Найдено");
}

export function startTimerButton(scope: Scope, title: string): Locator {
  return button(scope, `Запустить таймер: ${title}`);
}

export function stopTimerButton(scope: Scope, title: string): Locator {
  return button(scope, `Остановить таймер: ${title}`);
}

export async function openPicker(page: Page, triggerName = PICKER_TRIGGER): Promise<void> {
  const trigger = pickerTrigger(page, triggerName);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

export async function expectPickerClosed(page: Page): Promise<void> {
  await expect(pickerTrigger(page)).toHaveAttribute("aria-expanded", "false");
  await expect(taskSearch(page)).toBeHidden();
}

export async function searchTasks(page: Page, text: string): Promise<void> {
  await openPicker(page);
  await taskSearch(page).fill(text);
}

export async function startFromPicker(page: Page, title: string): Promise<void> {
  await searchTasks(page, title);
  await startTimerButton(foundTasks(page), title).click();
  await expectPickerClosed(page);
}

export async function expectStartRows(scope: Locator, titles: string[]): Promise<void> {
  const rows = scope.getByRole("button", { name: START_ROW });
  await expect(rows).toHaveCount(titles.length);
  for (const [index, title] of titles.entries()) {
    await expect(rows.nth(index)).toHaveAccessibleName(`Запустить таймер: ${title}`);
  }
}

export async function expectTopToBottom(rows: Locator[]): Promise<void> {
  const tops: number[] = [];
  for (const row of rows) {
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    if (box === null) throw new Error("row has no bounding box");
    tops.push(box.y);
  }
  expect(tops).toEqual([...tops].sort((above, below) => above - below));
}
