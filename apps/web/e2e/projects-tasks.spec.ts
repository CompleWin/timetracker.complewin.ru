import { expect, test, type Locator, type Page } from "@playwright/test";
import { createProject, createTask, listProjects } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import {
  button,
  chooseRadio,
  dialog,
  expectInSection,
  heading,
  menuItem,
  textOf,
} from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

async function submitNewProject(page: Page, name: string, color?: string): Promise<Locator> {
  await button(page, "Новый проект").click();
  const form = dialog(page, "Новый проект");
  await form.getByLabel("Название", { exact: true }).fill(name);
  if (color !== undefined) await chooseRadio(form, color);
  await button(form, "Создать").click();
  return form;
}

async function fillTask(form: Locator, title: string, project?: string): Promise<void> {
  await form.getByLabel("Название", { exact: true }).fill(title);
  if (project !== undefined) {
    await form.getByLabel("Проект", { exact: true }).selectOption({ label: project });
  }
}

async function submit(form: Locator, action: string): Promise<void> {
  await button(form, action).click();
  await expect(form).toBeHidden();
}

async function createTaskWithDialog(page: Page, title: string, project: string): Promise<void> {
  await button(page, "Новая задача").click();
  const form = dialog(page, "Новая задача");
  await fillTask(form, title, project);
  await submit(form, "Создать");
}

async function openMenu(page: Page, trigger: string, item: string): Promise<void> {
  await button(page, trigger).click();
  await menuItem(page, item).click();
}

async function sportWithTreadmillAndAnki(page: Page): Promise<void> {
  const sport = await createProject(page, { name: "Спорт", color: "green" });
  await createTask(page, { title: "Беговая дорожка", projectId: sport.id });
  await createTask(page, { title: "Anki" });
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

test("12. проект «Спорт» с цветом «Зелёный», задачи «Беговая дорожка» в нём и «Anki» без проекта видны в своих группах", async ({
  page,
}) => {
  await page.goto("/");

  const projectForm = await submitNewProject(page, "Спорт", "Зелёный");
  await expect(projectForm).toBeHidden();
  await expect(heading(page, "Спорт")).toBeVisible();
  await createTaskWithDialog(page, "Беговая дорожка", "Спорт");
  await createTaskWithDialog(page, "Anki", "Без проекта");

  await expectInSection(page, "Спорт", textOf(page, "Беговая дорожка"));
  await expectInSection(page, "Без проекта", textOf(page, "Anki"));
  expect(await listProjects(page)).toMatchObject([{ name: "Спорт", color: "green" }]);
});

test("12. «Добавить задачу» в группе «Спорт» создаёт задачу в этом проекте", async ({ page }) => {
  await createProject(page, { name: "Спорт" });
  await page.goto("/");

  await button(page, "Добавить задачу").click();
  const form = dialog(page, "Новая задача");
  await fillTask(form, "Беговая дорожка");
  await submit(form, "Создать");

  await expectInSection(page, "Спорт", textOf(page, "Беговая дорожка"));
});

test("12. без задач на главной виден текст «Пока нет задач»", async ({ page }) => {
  await page.goto("/");

  await expect(textOf(page, "Пока нет задач")).toBeVisible();
});

test("13. повторное создание проекта «спорт» показывает «Проект с таким названием уже есть»", async ({
  page,
}) => {
  await createProject(page, { name: "Спорт" });
  await page.goto("/");

  const form = await submitNewProject(page, "спорт");

  await expect(textOf(form, "Проект с таким названием уже есть")).toBeVisible();
});

test("14. «Изменить» у задачи «Anki» с переносом в «Спорт» переносит её в группу «Спорт»", async ({
  page,
}) => {
  await sportWithTreadmillAndAnki(page);
  await page.goto("/");
  await expectInSection(page, "Без проекта", textOf(page, "Anki"));

  await openMenu(page, "Действия с задачей Anki", "Изменить");
  const form = dialog(page, "Изменить задачу");
  await form.getByLabel("Проект", { exact: true }).selectOption({ label: "Спорт" });
  await submit(form, "Сохранить");

  await expectInSection(page, "Спорт", textOf(page, "Anki"));
  await expect(heading(page, "Без проекта")).toHaveCount(0);
});

test("15. «В архив» у проекта «Спорт» убирает группу с главной, «Вернуть Спорт» на /archive возвращает её", async ({
  page,
}) => {
  await sportWithTreadmillAndAnki(page);
  await page.goto("/");

  await openMenu(page, "Действия с проектом Спорт", "В архив");

  await expect(heading(page, "Спорт")).toHaveCount(0);
  await expect(textOf(page, "Беговая дорожка")).toBeHidden();

  await page.getByRole("link", { name: "Архив", exact: true }).click();

  await expect(page).toHaveURL(urlMatching("/archive"));
  await expect(heading(page, "Задачи в архиве")).toBeVisible();
  await expectInSection(page, "Проекты в архиве", button(page, "Вернуть Спорт"));

  await button(page, "Вернуть Спорт").click();

  await expect(button(page, "Вернуть Спорт")).toHaveCount(0);
  await page.goto("/");
  await expectInSection(page, "Спорт", textOf(page, "Беговая дорожка"));
});

test("16. поиск «бег» оставляет на экране только «Беговая дорожка»", async ({ page }) => {
  await sportWithTreadmillAndAnki(page);
  await createTask(page, { title: "Отжимания" });
  await page.goto("/");
  await expect(textOf(page, "Anki")).toBeVisible();

  await page.getByLabel("Поиск задач", { exact: true }).fill("бег");

  await expect(textOf(page, "Беговая дорожка")).toBeVisible();
  await expect(textOf(page, "Anki")).toBeHidden();
  await expect(textOf(page, "Отжимания")).toBeHidden();
});
