import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  archiveTask,
  createProject,
  createTask,
  pinTask,
  startTimer,
  type Task,
} from "./helpers/api.ts";
import { addLocalSession, afternoonZone, loginInZone } from "./helpers/afternoon.ts";
import { foundTasks, openPicker, startTimerButton, taskSearch } from "./helpers/picker.ts";
import { openTaskPage } from "./helpers/task-page.ts";
import { button, group, link, runningNow } from "./helpers/ui.ts";

const ZONE = afternoonZone();
const NOTION_MARK = "Задача из Notion";

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

function notionMarks(scope: Page | Locator): Locator {
  return scope.getByRole("img", { name: NOTION_MARK });
}

async function siteTask(page: Page): Promise<Task> {
  const languages = await createProject(page, { name: "Языки" });
  return createTask(page, { title: "Anki", projectId: languages.id });
}

test("13. у задачи с сайта нет знака Notion в разделах панели выбора и в результатах поиска", async ({
  page,
}) => {
  const anki = await siteTask(page);
  await pinTask(page, anki.id);
  await addLocalSession(page, ZONE, anki.id, { start: "09:00", end: "09:30" });
  await page.goto("/");

  await openPicker(page);

  for (const section of ["Недавние", "Закреплённые", "Языки"]) {
    await expect(startTimerButton(group(page, section), "Anki")).toBeVisible();
  }
  await expect(notionMarks(page)).toHaveCount(0);

  await taskSearch(page).fill("Anki");

  await expect(startTimerButton(foundTasks(page), "Anki")).toBeVisible();
  await expect(notionMarks(page)).toHaveCount(0);
});

test("13. у задачи с сайта нет знака Notion в строке идущего таймера", async ({ page }) => {
  const anki = await siteTask(page);
  await startTimer(page, anki.id);
  await page.goto("/");

  await expect(link(runningNow(page), "Anki")).toBeVisible();
  await expect(notionMarks(page)).toHaveCount(0);
});

test("13. у задачи с сайта нет знака Notion на странице задачи", async ({ page }) => {
  const anki = await siteTask(page);

  await openTaskPage(page, anki);

  await expect(notionMarks(page)).toHaveCount(0);
});

test("13. у задачи с сайта нет знака Notion в архиве", async ({ page }) => {
  const anki = await siteTask(page);
  await archiveTask(page, anki.id);

  await page.goto("/archive");

  await expect(button(page, "Вернуть Anki")).toBeVisible();
  await expect(notionMarks(page)).toHaveCount(0);
});
