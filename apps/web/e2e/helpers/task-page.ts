import { expect, type Locator, type Page } from "@playwright/test";
import type { Task } from "./api.ts";
import { button, dialog, field, heading, island } from "./ui.ts";

export async function openTaskPage(page: Page, task: Task): Promise<void> {
  await page.goto(`/tasks/${task.id}`);
  await expect(heading(page, task.title)).toBeVisible();
}

export function taskHeader(page: Page, task: Task): Locator {
  return island(page, task.title);
}

export function byDayIsland(page: Page): Locator {
  return island(page, "По дням");
}

export async function openTaskEditor(page: Page): Promise<Locator> {
  await button(page, "Изменить задачу").click();
  const form = dialog(page, "Изменить задачу");
  await expect(form).toBeVisible();
  return form;
}

export async function saveTaskEditor(form: Locator): Promise<void> {
  await button(form, "Сохранить").click();
  await expect(form).toBeHidden();
}

export async function moveTaskToProject(page: Page, project: string): Promise<void> {
  const form = await openTaskEditor(page);
  await field(form, "Проект").selectOption({ label: project });
  await saveTaskEditor(form);
}
