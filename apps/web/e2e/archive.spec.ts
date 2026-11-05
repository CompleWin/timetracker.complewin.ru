import { expect, test, type Locator, type Page } from "@playwright/test";
import { archiveProject, archiveTask, createProject, createTask } from "./helpers/api.ts";
import { afternoonZone, localDateRu, loginInZone } from "./helpers/afternoon.ts";
import { button, heading, island, pageTitle, textOf } from "./helpers/ui.ts";

type Archived = {
  archivedAt: string | null;
};

const ZONE = afternoonZone();
const RESTORE = /^Вернуть /;
const ARCHIVE_HINT = "Вернувшееся снова появится в трекере, с прежними сессиями";
const NAME_TAKEN = "Проект с таким названием уже есть";

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

function archivedProjects(page: Page): Locator {
  return island(page, "Проекты в архиве");
}

function archivedTasks(page: Page): Locator {
  return island(page, "Задачи в архиве");
}

function restoreButton(page: Page, name: string): Locator {
  return button(page, `Вернуть ${name}`);
}

function archivedSince({ archivedAt }: Archived): string {
  if (archivedAt === null) throw new Error("archivedAt is null after archiving");
  return `в архиве с ${localDateRu(ZONE, archivedAt)}`;
}

async function expectRestoreOrder(list: Locator, names: string[]): Promise<void> {
  const restoreButtons = list.getByRole("button", { name: RESTORE });
  await expect(restoreButtons).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(restoreButtons.nth(index)).toHaveAccessibleName(`Вернуть ${name}`);
  }
}

async function expectInRowOf(page: Page, list: Locator, name: string, text: string): Promise<void> {
  await expect(textOf(list, text)).toBeVisible();
  const row = list
    .locator("*")
    .filter({ has: restoreButton(page, name) })
    .filter({ has: textOf(page, text) })
    .last();
  await expect(row.getByRole("button", { name: RESTORE })).toHaveCount(1);
}

test("12. «Архив» с пояснением; «Спорт» с тремя активными задачами из четырёх, убранный в архив позже «Учёбы», стоит первым с «3 задачи вернутся вместе с ним · в архиве с <дата>», рядом с заголовком «Проекты в архиве» число 2", async ({
  page,
}) => {
  const study = await createProject(page, { name: "Учёба" });
  const archivedStudy = await archiveProject(page, study.id);
  const sport = await createProject(page, { name: "Спорт" });
  const pullUps = await createTask(page, { title: "Турник", projectId: sport.id });
  for (const title of ["Бег", "Плавание", "Растяжка"]) {
    await createTask(page, { title, projectId: sport.id });
  }
  await archiveTask(page, pullUps.id);
  const archivedSport = await archiveProject(page, sport.id);

  await page.goto("/archive");

  await expect(pageTitle(page, "Архив")).toBeVisible();
  await expect(textOf(page, ARCHIVE_HINT)).toBeVisible();
  const projects = archivedProjects(page);
  await expect(heading(projects, "Проекты в архиве")).toBeVisible();
  await expect(textOf(projects, "2")).toBeVisible();
  await expectRestoreOrder(projects, ["Спорт", "Учёба"]);
  await expectInRowOf(
    page,
    projects,
    "Спорт",
    `3 задачи вернутся вместе с ним · ${archivedSince(archivedSport)}`,
  );
  await expectInRowOf(page, projects, "Учёба", archivedSince(archivedStudy));
});

test("13. «Anki» проекта «Языки» показывает «Языки · в архиве с <дата>», задача без проекта — «Без проекта · в архиве с <дата>», последняя убранная в архив стоит первой", async ({
  page,
}) => {
  const languages = await createProject(page, { name: "Языки" });
  const anki = await createTask(page, { title: "Anki", projectId: languages.id });
  const reading = await createTask(page, { title: "Чтение" });
  const archivedAnki = await archiveTask(page, anki.id);
  const archivedReading = await archiveTask(page, reading.id);

  await page.goto("/archive");

  const tasks = archivedTasks(page);
  await expectRestoreOrder(tasks, ["Чтение", "Anki"]);
  await expectInRowOf(page, tasks, "Anki", `Языки · ${archivedSince(archivedAnki)}`);
  await expectInRowOf(page, tasks, "Чтение", `Без проекта · ${archivedSince(archivedReading)}`);
});

test("14. возврат «Спорт» при занятом названии показывает «Проект с таким названием уже есть», «Скрыть» убирает плашку", async ({
  page,
}) => {
  const oldSport = await createProject(page, { name: "Спорт" });
  await archiveProject(page, oldSport.id);
  await createProject(page, { name: "Спорт" });
  await page.goto("/archive");

  await restoreButton(page, "Спорт").click();

  await expect(textOf(page, NAME_TAKEN)).toBeVisible();

  await button(page, "Скрыть").click();

  await expect(textOf(page, NAME_TAKEN)).toBeHidden();
  await expect(restoreButton(page, "Спорт")).toBeVisible();
});

test("15. пустой архив: «В архиве нет проектов» и «В архиве нет задач»", async ({ page }) => {
  await page.goto("/archive");

  await expect(textOf(archivedProjects(page), "В архиве нет проектов")).toBeVisible();
  await expect(textOf(archivedTasks(page), "В архиве нет задач")).toBeVisible();
});
