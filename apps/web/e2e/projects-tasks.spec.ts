import { expect, test, type Locator, type Page } from "@playwright/test";
import { goToSection } from "./helpers/account-menu.ts";
import { createProject, createTask, listProjects, type Task } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import {
  expectStartRows,
  foundTasks,
  openPicker,
  projectTree,
  searchTasks,
  startTimerButton,
} from "./helpers/picker.ts";
import {
  button,
  chooseRadio,
  dialog,
  expectInSection,
  field,
  group,
  heading,
  menuItem,
  textOf,
} from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

async function openFromCreateMenu(page: Page, item: string): Promise<Locator> {
  await openPicker(page);
  await button(page, "Создать").click();
  await menuItem(page, item).click();
  const form = dialog(page, item);
  await expect(form).toBeVisible();
  return form;
}

async function submitNewProject(page: Page, name: string, color?: string): Promise<Locator> {
  const form = await openFromCreateMenu(page, "Новый проект");
  await field(form, "Название").fill(name);
  if (color !== undefined) await chooseRadio(form, color);
  await button(form, "Создать").click();
  return form;
}

async function submit(form: Locator, action: string): Promise<void> {
  await button(form, action).click();
  await expect(form).toBeHidden();
}

async function createTaskWithDialog(page: Page, title: string, project: string): Promise<void> {
  const form = await openFromCreateMenu(page, "Новая задача");
  await field(form, "Название").fill(title);
  await field(form, "Проект").selectOption({ label: project });
  await submit(form, "Создать");
}

async function sportWithTreadmillAndAnki(page: Page): Promise<Task> {
  const sport = await createProject(page, { name: "Спорт", color: "green" });
  await createTask(page, { title: "Беговая дорожка", projectId: sport.id });
  return createTask(page, { title: "Anki" });
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

test("12. через «Создать» в панели выбора: проект «Спорт» с цветом «Зелёный», «Беговая дорожка» видна в группе «Спорт», «Anki» после раскрытия в группе «Без проекта»", async ({
  page,
}) => {
  await page.goto("/");

  const projectForm = await submitNewProject(page, "Спорт", "Зелёный");
  await expect(projectForm).toBeHidden();
  await createTaskWithDialog(page, "Беговая дорожка", "Спорт");
  await createTaskWithDialog(page, "Anki", "Без проекта");

  await openPicker(page);
  await expect(startTimerButton(group(page, "Спорт"), "Беговая дорожка")).toBeVisible();
  await button(projectTree(page), "Без проекта").click();
  await expect(startTimerButton(group(page, "Без проекта"), "Anki")).toBeVisible();
  expect(await listProjects(page)).toMatchObject([{ name: "Спорт", color: "green" }]);
});

test("13. повторное создание проекта «спорт» через «Создать» и «Новый проект» показывает «Проект с таким названием уже есть»", async ({
  page,
}) => {
  await createProject(page, { name: "Спорт" });
  await page.goto("/");

  const form = await submitNewProject(page, "спорт");

  await expect(textOf(form, "Проект с таким названием уже есть")).toBeVisible();
});

test("14. «Изменить задачу» на странице «Anki» с переносом в «Спорт» ставит «Anki» в группу «Спорт» в дереве панели", async ({
  page,
}) => {
  const anki = await sportWithTreadmillAndAnki(page);
  await page.goto(`/tasks/${anki.id}`);

  await button(page, "Изменить задачу").click();
  const form = dialog(page, "Изменить задачу");
  await field(form, "Проект").selectOption({ label: "Спорт" });
  await submit(form, "Сохранить");

  await page.goto("/");
  await openPicker(page);
  await expect(startTimerButton(group(page, "Спорт"), "Anki")).toBeVisible();
  await expect(button(projectTree(page), "Без проекта")).toHaveCount(0);
});

test("15. «В архив» в меню «Действия с проектом Спорт» убирает «Спорт» из дерева, на /archive из меню «Меню» «Вернуть Спорт» возвращает его", async ({
  page,
}) => {
  await sportWithTreadmillAndAnki(page);
  await page.goto("/");
  await openPicker(page);

  await button(projectTree(page), "Действия с проектом Спорт").click();
  await menuItem(page, "В архив").click();

  await expect(button(projectTree(page), "Спорт")).toHaveCount(0);
  await page.reload();
  await openPicker(page);
  await expect(button(projectTree(page), "Без проекта")).toBeVisible();
  await expect(button(projectTree(page), "Спорт")).toHaveCount(0);

  await goToSection(page, "Архив");

  await expect(page).toHaveURL(urlMatching("/archive"));
  await expect(heading(page, "Задачи в архиве")).toBeVisible();
  await expectInSection(page, "Проекты в архиве", button(page, "Вернуть Спорт"));

  await button(page, "Вернуть Спорт").click();

  await expect(button(page, "Вернуть Спорт")).toHaveCount(0);
  await page.goto("/");
  await openPicker(page);
  await expect(startTimerButton(group(page, "Спорт"), "Беговая дорожка")).toBeVisible();
});

test("16. поиск «бег» в панели оставляет в группе «Найдено» одну задачу «Беговая дорожка»", async ({
  page,
}) => {
  await sportWithTreadmillAndAnki(page);
  await createTask(page, { title: "Отжимания" });
  await page.goto("/");

  await searchTasks(page, "бег");

  await expectStartRows(foundTasks(page), ["Беговая дорожка"]);
});
