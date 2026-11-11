import { expect, test, type Page } from "@playwright/test";
import { createProject, createTask } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { PHONE_VIEWPORT, expectNoHorizontalScroll } from "./helpers/layout.ts";
import { openTasksPage, selectTasks, selectedTasks } from "./helpers/tasks-page.ts";
import { link } from "./helpers/ui.ts";

const LONG_TASK_TITLE =
  "Карточки Anki: неправильные глаголы, фразовые глаголы и устойчивые выражения";

test.use({ viewport: PHONE_VIEWPORT });

async function threeGroupsWithLongTitle(page: Page): Promise<void> {
  const languages = await createProject(page, { name: "Иностранные языки" });
  const sport = await createProject(page, { name: "Спорт" });
  await createTask(page, { title: LONG_TASK_TITLE, projectId: languages.id });
  await createTask(page, { title: "Бег по утрам", projectId: sport.id });
  await createTask(page, { title: "Почта" });
}

test("17. при ширине 390 px на /tasks с тремя группами и длинным названием задачи нет горизонтальной прокрутки, в том числе с регионом «Выбранные задачи»", async ({
  page,
}) => {
  await loginAs(page);
  await threeGroupsWithLongTitle(page);
  await openTasksPage(page);
  await expect(link(page, LONG_TASK_TITLE)).toBeVisible();

  await expectNoHorizontalScroll(page);

  await selectTasks(page, [LONG_TASK_TITLE]);
  await expect(selectedTasks(page)).toBeVisible();

  await expectNoHorizontalScroll(page);
});
