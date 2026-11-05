import { expect, type Locator, type Page } from "@playwright/test";
import type { Task } from "./api.ts";
import { heading, island } from "./ui.ts";

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
