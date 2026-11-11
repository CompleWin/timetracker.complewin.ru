import { expect, type Locator, type Page } from "@playwright/test";
import { archiveProject, archiveTask, createProject, createTask, type Task } from "./api.ts";
import { button, dialog, field, pageTitle, region } from "./ui.ts";

type Scope = Page | Locator;

export type SportStudyLanguages = {
  run: Task;
  gym: Task;
  anki: Task;
  mail: Task;
};

export const ACTIVE_GROUPS = ["Спорт", "Учёба", "Языки", "Без проекта"];

export async function openTasksPage(page: Page): Promise<void> {
  await page.goto("/tasks");
  await expect(pageTitle(page, "Задачи")).toBeVisible();
}

export function groupHeading(page: Page, name: string): Locator {
  return page.getByRole("heading", { level: 2, name, exact: true });
}

export function taskSearchField(page: Page): Locator {
  return field(page, "Поиск по задачам");
}

export function selectAllCheckbox(page: Page): Locator {
  return page.getByRole("checkbox", { name: "Выбрать все", exact: true });
}

export function taskCheckbox(scope: Scope, title: string): Locator {
  return scope.getByRole("checkbox", { name: `Выбрать: ${title}`, exact: true });
}

export function editTaskButton(scope: Scope, title: string): Locator {
  return button(scope, `Изменить задачу: ${title}`);
}

export function archiveTaskButton(scope: Scope, title: string): Locator {
  return button(scope, `В архив: ${title}`);
}

export function selectedTasks(page: Page): Locator {
  return region(page, "Выбранные задачи");
}

export function moveTargetField(page: Page): Locator {
  return field(selectedTasks(page), "Перенести в проект");
}

export function taskRow(page: Page, title: string): Locator {
  return page
    .locator("*")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) })
    .filter({ has: taskCheckbox(page, title) })
    .last();
}

export async function selectTasks(page: Page, titles: string[]): Promise<void> {
  for (const title of titles) {
    await taskCheckbox(page, title).click();
    await expect(taskCheckbox(page, title)).toBeChecked();
  }
}

export async function searchOnTasksPage(page: Page, text: string): Promise<void> {
  await taskSearchField(page).fill(text);
}

export async function moveSelectedTo(page: Page, project: string): Promise<void> {
  await moveTargetField(page).selectOption({ label: project });
  await button(selectedTasks(page), "Перенести").click();
}

export async function openArchiveConfirm(page: Page, title: string): Promise<Locator> {
  await button(selectedTasks(page), "В архив").click();
  const confirm = dialog(page, title);
  await expect(confirm).toBeVisible();
  return confirm;
}

export async function sportStudyLanguages(page: Page): Promise<SportStudyLanguages> {
  const sport = await createProject(page, { name: "Спорт", color: "green" });
  await createProject(page, { name: "Учёба", color: "blue" });
  const languages = await createProject(page, { name: "Языки", color: "purple" });
  const old = await createProject(page, { name: "Старое" });
  const run = await createTask(page, { title: "Бег", projectId: sport.id });
  const gym = await createTask(page, { title: "Зал", projectId: sport.id });
  const oldRun = await createTask(page, { title: "Старый бег", projectId: sport.id });
  const anki = await createTask(page, { title: "Anki", projectId: languages.id });
  await createTask(page, { title: "Старая задача", projectId: old.id });
  const mail = await createTask(page, { title: "Почта" });
  await archiveTask(page, oldRun.id);
  await archiveProject(page, old.id);
  return { run, gym, anki, mail };
}
