import { expect, test, type Page } from "@playwright/test";
import {
  archiveProject,
  archiveTask,
  createProject,
  createTask,
  startTimer,
  type Task,
} from "./helpers/api.ts";
import { addLocalSession, afternoonZone, loginInZone } from "./helpers/afternoon.ts";
import {
  PAGE_TITLE_FONT_SIZE,
  PHONE_VIEWPORT,
  expectNoHorizontalScroll,
} from "./helpers/layout.ts";
import { stopTimerButton } from "./helpers/picker.ts";
import { openTaskPage } from "./helpers/task-page.ts";
import { button, heading, pageTitle } from "./helpers/ui.ts";

const ZONE = afternoonZone();
const LONG_TASK_TITLE = "Карточки Anki: неправильные глаголы";
const LONG_NOTE =
  "Повторил неправильные глаголы, разобрал ошибки и добавил новые карточки в колоду";

const titledPages = [
  { path: "/archive", title: "Архив" },
  { path: "/settings", title: "Настройки" },
];

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

async function runningTaskWithSessionsOnSeveralDays(page: Page): Promise<Task> {
  const languages = await createProject(page, { name: "Иностранные языки" });
  const anki = await createTask(page, { title: LONG_TASK_TITLE, projectId: languages.id });
  for (const daysAgo of [0, 1, 3]) {
    await addLocalSession(page, ZONE, anki.id, {
      start: "10:00",
      end: "11:15",
      daysAgo,
      note: LONG_NOTE,
    });
  }
  await startTimer(page, anki.id);
  return anki;
}

async function archiveWithProjectsAndTasks(page: Page): Promise<void> {
  const languages = await createProject(page, { name: "Иностранные языки" });
  const sport = await createProject(page, { name: "Спорт" });
  await createTask(page, { title: "Грамматика", projectId: languages.id });
  const anki = await createTask(page, { title: LONG_TASK_TITLE, projectId: languages.id });
  const run = await createTask(page, { title: "Бег по утрам" });
  await archiveTask(page, anki.id);
  await archiveTask(page, run.id);
  await archiveProject(page, languages.id);
  await archiveProject(page, sport.id);
}

for (const { path, title } of titledPages) {
  test(`17. h1 «${title}» на ${path} имеет font-size 28 px`, async ({ page }) => {
    await page.goto(path);

    await expect(pageTitle(page, title)).toBeVisible();
    await expect(pageTitle(page, title)).toHaveCSS("font-size", PAGE_TITLE_FONT_SIZE);
  });
}

test.describe("ширина окна 390 px", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("18. на странице задачи с идущим таймером и сессиями за несколько дней нет горизонтальной прокрутки", async ({
    page,
  }) => {
    const anki = await runningTaskWithSessionsOnSeveralDays(page);

    await openTaskPage(page, anki);
    await expect(stopTimerButton(page, LONG_TASK_TITLE)).toBeVisible();

    await expectNoHorizontalScroll(page);
  });

  test("18. на /archive с проектами и задачами нет горизонтальной прокрутки", async ({ page }) => {
    await archiveWithProjectsAndTasks(page);

    await page.goto("/archive");
    await expect(button(page, `Вернуть ${LONG_TASK_TITLE}`)).toBeVisible();

    await expectNoHorizontalScroll(page);
  });

  test("18. на /settings нет горизонтальной прокрутки", async ({ page }) => {
    await page.goto("/settings");
    await expect(heading(page, "Язык")).toBeVisible();

    await expectNoHorizontalScroll(page);
  });
});
