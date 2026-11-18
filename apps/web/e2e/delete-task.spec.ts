import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  archiveProject,
  archiveTask,
  createProject,
  createTask,
  type Task,
} from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { foundTasks, searchTasks, startTimerButton } from "./helpers/picker.ts";
import { openTaskPage } from "./helpers/task-page.ts";
import { archiveTaskButton, openTasksPage } from "./helpers/tasks-page.ts";
import { button, dialog, link, region, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const DELETE_NOTE = "Задача и все её сессии удалятся навсегда, вернуть их не получится.";
const NOTION_NOTE = "Страница в Notion останется, трекер больше не будет её импортировать.";

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

async function expectDeleteIconAfter(archive: Locator, remove: Locator): Promise<void> {
  await expect(archive).toBeVisible();
  await expect(remove).toBeVisible();
  await expect(remove).toHaveText("");
  const archiveBox = await archive.boundingBox();
  const removeBox = await remove.boundingBox();
  if (archiveBox === null || removeBox === null) throw new Error("Action button is not visible");
  expect(removeBox.x).toBeGreaterThanOrEqual(archiveBox.x + archiveBox.width);
}

async function openConfirmation(page: Page, opener: Locator): Promise<Locator> {
  await opener.click();
  const confirmation = dialog(page, "Удалить задачу?");
  await expect(confirmation).toBeVisible();
  return confirmation;
}

test("12, 14, 15. удаление со страницы задачи с подтверждением и возвратом в трекер", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  const other = await createTask(page, { title: "Anki: чтение" });
  await openTaskPage(page, task);

  const opener = button(page, "Удалить задачу");
  await expectDeleteIconAfter(button(page, "В архив"), opener);
  const confirmation = await openConfirmation(page, opener);
  await expect(textOf(confirmation, DELETE_NOTE)).toBeVisible();
  await expect(button(confirmation, "Удалить")).toBeEnabled();
  await expect(button(confirmation, "Отмена")).toBeFocused();

  await button(confirmation, "Отмена").click();
  await expect(confirmation).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(urlMatching(`/tasks/${task.id}`));

  await openConfirmation(page, opener);
  await button(confirmation, "Удалить").click();
  await expect(page).toHaveURL(urlMatching("/"));
  await searchTasks(page, "Anki");
  await expect(startTimerButton(foundTasks(page), other.title)).toBeVisible();
  await expect(startTimerButton(foundTasks(page), task.title)).toHaveCount(0);
});

test("13. подтверждение удаления задачи из Notion объясняет, что будет со страницей", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  await page.route(urlMatching(`/api/tasks/${task.id}`), async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { task: Task };
    const notionPageUrl = "https://www.notion.so/00000000000040008000000000000001";
    await route.fulfill({
      response,
      json: { ...body, task: { ...body.task, notionPageUrl } },
    });
  });
  await openTaskPage(page, task);

  const confirmation = await openConfirmation(page, button(page, "Удалить задачу"));

  await expect(confirmation.getByText(DELETE_NOTE)).toBeVisible();
  await expect(confirmation.getByText(NOTION_NOTE)).toBeVisible();
});

test("16. иконка удаления в строке открывает подтверждение и убирает задачу из списка", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  const other = await createTask(page, { title: "Чтение" });
  await openTasksPage(page);
  const opener = button(page, `Удалить задачу: ${task.title}`);
  await expectDeleteIconAfter(archiveTaskButton(page, task.title), opener);
  const confirmation = await openConfirmation(page, opener);
  await button(confirmation, "Удалить").click();

  await expect(confirmation).toBeHidden();
  await expect(page).toHaveURL(urlMatching("/tasks"));
  await expect(link(page, task.title)).toHaveCount(0);
  await expect(link(page, other.title)).toBeVisible();
});

test("17, 18. удаление из архива доступно у задач и обновляет счётчик", async ({ page }) => {
  const task = await createTask(page, { title: "Anki" });
  const other = await createTask(page, { title: "Чтение" });
  await archiveTask(page, task.id);
  await archiveTask(page, other.id);
  const project = await createProject(page, { name: "Языки" });
  await archiveProject(page, project.id);
  await page.goto("/archive");

  const tasks = region(page, "Задачи в архиве");
  const projects = region(page, "Проекты в архиве");
  await expect(button(projects, "Вернуть Языки")).toBeVisible();
  await expect(projects.getByRole("button", { name: /^Удалить навсегда / })).toHaveCount(0);
  await expect(textOf(tasks, "2")).toBeVisible();

  const opener = button(tasks, "Удалить навсегда Anki");
  await expectDeleteIconAfter(button(tasks, "Вернуть Anki"), opener);
  const confirmation = await openConfirmation(page, opener);
  await expect(textOf(confirmation, DELETE_NOTE)).toBeVisible();
  await button(confirmation, "Удалить").click();

  await expect(confirmation).toBeHidden();
  await expect(textOf(tasks, "Anki")).toHaveCount(0);
  await expect(button(tasks, "Вернуть Чтение")).toBeVisible();
  await expect(textOf(tasks, "1")).toBeVisible();
});

test("19. без сети удаление задачи со страницы задачи, из списка и архива недоступно", async ({
  page,
  context,
}) => {
  const task = await createTask(page, { title: "Anki" });
  await openTaskPage(page, task);

  const taskDelete = button(page, "Удалить задачу");
  await expect(taskDelete).toBeEnabled();
  await context.setOffline(true);
  await expect(taskDelete).toBeDisabled();
  await context.setOffline(false);
  await expect(taskDelete).toBeEnabled();

  await openTasksPage(page);
  const listDelete = button(page, "Удалить задачу: Anki");
  await expect(listDelete).toBeEnabled();
  await context.setOffline(true);
  await expect(listDelete).toBeDisabled();
  await context.setOffline(false);
  await expect(listDelete).toBeEnabled();

  await archiveTask(page, task.id);
  await page.goto("/archive");
  const archiveDelete = button(page, "Удалить навсегда Anki");
  await expect(archiveDelete).toBeEnabled();

  await context.setOffline(true);
  await expect(archiveDelete).toBeDisabled();
  await context.setOffline(false);
  await expect(archiveDelete).toBeEnabled();
});
