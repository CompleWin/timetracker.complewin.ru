import { expect, test, type Page, type Route } from "@playwright/test";
import { accountMenu, openAccountMenu } from "./helpers/account-menu.ts";
import { activeTimers, createProject, createTask, startTimer } from "./helpers/api.ts";
import { addLocalSession, afternoonZone, localTime, loginInZone } from "./helpers/afternoon.ts";
import { PAGE_TITLE_FONT_SIZE } from "./helpers/layout.ts";
import { expectTopToBottom } from "./helpers/picker.ts";
import { saveTaskEditor } from "./helpers/task-page.ts";
import {
  ACTIVE_GROUPS,
  archiveTaskButton,
  editTaskButton,
  groupHeading,
  moveSelectedTo,
  moveTargetField,
  openArchiveConfirm,
  openTasksPage,
  searchOnTasksPage,
  selectAllCheckbox,
  selectTasks,
  selectedTasks,
  sportStudyLanguages,
  taskCheckbox,
  taskRow,
  taskSearchField,
} from "./helpers/tasks-page.ts";
import {
  button,
  dialog,
  expectInSection,
  field,
  link,
  menuItem,
  pageTitle,
  textOf,
} from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const ZONE = afternoonZone();
const SECTIONS = ["Трекер", "Задачи", "Архив", "Настройки"];
const PAGE_HINT = "Активные задачи по проектам. Архивные задачи на странице «Архив».";
const ARCHIVE_CONFIRM_TEXT =
  "Идущие таймеры этих задач остановятся. Вернуть задачи можно на странице «Архив».";
const PARTIAL_FAILURE = "Не удалось изменить 1 из 2. Они остались выбранными, попробуй ещё раз.";
const PROJECT_ACTIONS = /^Действия с проектом /;
const ALL_ACTIVE_TASKS = 4;

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

async function expectGroupsHidden(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    await expect(groupHeading(page, name)).toHaveCount(0);
  }
}

async function expectNothingSelected(page: Page, titles: string[]): Promise<void> {
  await expect(selectedTasks(page)).toHaveCount(0);
  for (const title of titles) {
    await expect(taskCheckbox(page, title)).not.toBeChecked();
  }
}

async function failPatch(route: Route): Promise<void> {
  if (route.request().method() === "PATCH") {
    await route.fulfill({ status: 500 });
    return;
  }
  await route.fallback();
}

test("1. в меню «Меню» «Трекер», «Задачи», «Архив», «Настройки» по порядку; «Задачи» открывает /tasks, в снова открытом меню aria-current у «Задачи», h1 «Задачи» 28 px", async ({
  page,
}) => {
  await page.goto("/");
  await openAccountMenu(page);
  await expect(accountMenu(page).getByRole("link")).toHaveText(SECTIONS);

  await link(accountMenu(page), "Задачи").click();

  await expect(page).toHaveURL(urlMatching("/tasks"));
  await expect(pageTitle(page, "Задачи")).toHaveCSS("font-size", PAGE_TITLE_FONT_SIZE);
  await expect(textOf(page, PAGE_HINT)).toBeVisible();
  await openAccountMenu(page);
  const menu = accountMenu(page);
  await expect(link(menu, "Задачи")).toHaveAttribute("aria-current", "page");
  for (const other of SECTIONS.filter((section) => section !== "Задачи")) {
    await expect(link(menu, other)).not.toHaveAttribute("aria-current", "page");
  }
});

test("2. группы «Спорт», «Учёба», «Языки», «Без проекта» по порядку, «2 задачи» у «Спорт», «0 задач» и «В проекте пока нет задач» у «Учёба», архивного нет, у «Без проекта» нет «Действия с проектом …»", async ({
  page,
}) => {
  await sportStudyLanguages(page);

  await openTasksPage(page);

  await expectTopToBottom(ACTIVE_GROUPS.map((name) => groupHeading(page, name)));
  await expectInSection(page, "Спорт", textOf(page, "2 задачи"));
  await expectInSection(page, "Учёба", textOf(page, "0 задач"));
  await expectInSection(page, "Учёба", textOf(page, "В проекте пока нет задач"));
  await expectInSection(page, "Спорт", link(page, "Бег"));
  await expectInSection(page, "Спорт", link(page, "Зал"));
  await expectInSection(page, "Языки", link(page, "Anki"));
  await expectInSection(page, "Без проекта", link(page, "Почта"));
  await expect(link(page, "Старый бег")).toHaveCount(0);
  await expect(link(page, "Старая задача")).toHaveCount(0);
  await expectGroupsHidden(page, ["Старое"]);
  const projectActions = page.getByRole("button", { name: PROJECT_ACTIONS });
  await expect(projectActions).toHaveCount(3);
  for (const name of ["Спорт", "Учёба", "Языки"]) {
    await expect(button(page, `Действия с проектом ${name}`)).toBeVisible();
  }
});

test("3. у «Бег» «Всего: 1 ч» и «Последний раз: сегодня, 11:00», у «Зал» «Ещё не запускалась», у «Anki» с идущим таймером «Идёт с <время>», ссылка «Бег» открывает страницу задачи", async ({
  page,
}) => {
  const { run, anki } = await sportStudyLanguages(page);
  await addLocalSession(page, ZONE, run.id, { start: "10:00", end: "10:40" });
  await addLocalSession(page, ZONE, run.id, { start: "11:00", end: "11:20" });
  const running = await startTimer(page, anki.id);

  await openTasksPage(page);

  const runRow = taskRow(page, "Бег");
  await expect(textOf(runRow, "Всего: 1 ч")).toBeVisible();
  await expect(textOf(runRow, "Последний раз: сегодня, 11:00")).toBeVisible();
  await expect(textOf(taskRow(page, "Зал"), "Ещё не запускалась")).toBeVisible();
  const ankiStart = `Идёт с ${localTime(ZONE, running.startedAt)}`;
  await expect(textOf(taskRow(page, "Anki"), ankiStart)).toBeVisible();

  await link(page, "Бег").click();

  await expect(page).toHaveURL(urlMatching(`/tasks/${run.id}`));
});

test.describe("поиск", () => {
  test("4. поле «Поиск по задачам» с placeholder «Задача или проект»; «бег» оставляет группу «Спорт» с «Бег» и «1 задача»", async ({
    page,
  }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);
    await expect(taskSearchField(page)).toHaveAttribute("placeholder", "Задача или проект");

    await searchOnTasksPage(page, "бег");

    await expect(groupHeading(page, "Спорт")).toBeVisible();
    await expectGroupsHidden(page, ["Учёба", "Языки", "Без проекта"]);
    await expectInSection(page, "Спорт", link(page, "Бег"));
    await expectInSection(page, "Спорт", textOf(page, "1 задача"));
    await expect(link(page, "Зал")).toHaveCount(0);
  });

  test("4. «спорт» оставляет только группу «Спорт» с «Бег» и «Зал»", async ({ page }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);

    await searchOnTasksPage(page, "спорт");

    await expect(groupHeading(page, "Спорт")).toBeVisible();
    await expectGroupsHidden(page, ["Учёба", "Языки", "Без проекта"]);
    await expectInSection(page, "Спорт", link(page, "Бег"));
    await expectInSection(page, "Спорт", link(page, "Зал"));
    await expectInSection(page, "Спорт", textOf(page, "2 задачи"));
  });

  test("4. «xyz» показывает «Таких задач нет» без групп", async ({ page }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);

    await searchOnTasksPage(page, "xyz");

    await expect(textOf(page, "Таких задач нет")).toBeVisible();
    await expectGroupsHidden(page, ACTIVE_GROUPS);
  });
});

test.describe("действия в строке задачи", () => {
  test("5. «Изменить задачу: Почта» с названием «Почта и письма» и проектом «Учёба» ставит задачу в группу «Учёба», группы «Без проекта» нет", async ({
    page,
  }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);

    await editTaskButton(page, "Почта").click();
    const form = dialog(page, "Изменить задачу");
    await field(form, "Название").fill("Почта и письма");
    await field(form, "Проект").selectOption({ label: "Учёба" });
    await saveTaskEditor(form);

    await expectInSection(page, "Учёба", link(page, "Почта и письма"));
    await expectGroupsHidden(page, ["Без проекта"]);
  });

  test("6. «В архив: Anki» при идущем таймере убирает строку, останавливает таймер, задача видна на /archive", async ({
    page,
  }) => {
    const { anki } = await sportStudyLanguages(page);
    await startTimer(page, anki.id);
    await openTasksPage(page);

    await archiveTaskButton(page, "Anki").click();

    await expect(link(page, "Anki")).toHaveCount(0);
    await expect.poll(() => activeTimers(page)).toEqual([]);
    await page.goto("/archive");
    await expectInSection(page, "Задачи в архиве", button(page, "Вернуть Anki"));
  });
});

test.describe("выбор и панель выбранных", () => {
  test("7. выбор «Бег» и «Почта» показывает «Выбрано: 2» с выключенной «Перенести»; перенос в «Языки» ставит обе задачи в «Языки», убирает панель и снимает флажки", async ({
    page,
  }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);

    await selectTasks(page, ["Бег", "Почта"]);

    const panel = selectedTasks(page);
    await expect(textOf(panel, "Выбрано: 2")).toBeVisible();
    await expect(button(panel, "Перенести")).toBeDisabled();
    await expect(moveTargetField(page).getByRole("option")).toHaveText([
      "Выбери проект",
      "Без проекта",
      "Спорт",
      "Учёба",
      "Языки",
    ]);
    await expect(
      moveTargetField(page).getByRole("option", { name: "Выбери проект", selected: true }),
    ).toHaveCount(1);

    await moveSelectedTo(page, "Языки");

    await expectInSection(page, "Языки", link(page, "Бег"));
    await expectInSection(page, "Языки", link(page, "Почта"));
    await expectNothingSelected(page, ["Бег", "Почта"]);
  });

  test("8. «В архив» для «Бег» и «Зал»: диалог «В архив 2 задачи?», «Отмена» оставляет выбор, подтверждение убирает задачи в архив", async ({
    page,
  }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);
    await selectTasks(page, ["Бег", "Зал"]);

    const confirm = await openArchiveConfirm(page, "В архив 2 задачи?");
    await expect(textOf(confirm, ARCHIVE_CONFIRM_TEXT)).toBeVisible();
    await button(confirm, "Отмена").click();

    await expect(confirm).toBeHidden();
    await expect(link(page, "Бег")).toBeVisible();
    await expect(link(page, "Зал")).toBeVisible();
    await expect(textOf(selectedTasks(page), "Выбрано: 2")).toBeVisible();

    const again = await openArchiveConfirm(page, "В архив 2 задачи?");
    await button(again, "В архив").click();

    await expectInSection(page, "Спорт", textOf(page, "В проекте пока нет задач"));
    await expect(link(page, "Бег")).toHaveCount(0);
    await expect(link(page, "Зал")).toHaveCount(0);
    await page.goto("/archive");
    await expectInSection(page, "Задачи в архиве", button(page, "Вернуть Бег"));
    await expectInSection(page, "Задачи в архиве", button(page, "Вернуть Зал"));
  });

  test("9. «Выбрать все» при поиске выбирает только найденные, смена поиска снимает выбор; при части выбранных он indeterminate и выбирает все, повторное нажатие снимает выбор", async ({
    page,
  }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);
    const selectAll = selectAllCheckbox(page);

    await searchOnTasksPage(page, "бег");
    await selectAll.click();
    await expect(textOf(selectedTasks(page), "Выбрано: 1")).toBeVisible();

    await searchOnTasksPage(page, "");
    await expectNothingSelected(page, ["Бег"]);

    await selectTasks(page, ["Бег"]);
    await expect(selectAll).toBeChecked({ indeterminate: true });

    await selectAll.click();
    await expect(textOf(selectedTasks(page), `Выбрано: ${ALL_ACTIVE_TASKS}`)).toBeVisible();
    await expect(selectAll).toBeChecked();

    await selectAll.click();
    await expectNothingSelected(page, ["Бег", "Зал", "Anki", "Почта"]);
    await expect(selectAll).not.toBeChecked();
  });

  test("10. «Снять выбор» убирает регион «Выбранные задачи» и снимает флажки", async ({ page }) => {
    await sportStudyLanguages(page);
    await openTasksPage(page);
    await selectTasks(page, ["Бег", "Зал"]);

    await button(selectedTasks(page), "Снять выбор").click();

    await expectNothingSelected(page, ["Бег", "Зал"]);
  });

  test("11. перенос «Бег» и «Зал» в «Учёба» с ошибкой 500 для «Зал»: плашка «Не удалось изменить 1 из 2…», «Бег» в «Учёба», «Зал» остался выбранным, «Скрыть» убирает плашку", async ({
    page,
  }) => {
    const { gym } = await sportStudyLanguages(page);
    await page.route(urlMatching(`/api/tasks/${gym.id}`), failPatch);
    await openTasksPage(page);
    await selectTasks(page, ["Бег", "Зал"]);

    await moveSelectedTo(page, "Учёба");

    await expect(textOf(page, PARTIAL_FAILURE)).toBeVisible();
    await expectInSection(page, "Учёба", link(page, "Бег"));
    await expectInSection(page, "Спорт", link(page, "Зал"));
    await expect(textOf(selectedTasks(page), "Выбрано: 1")).toBeVisible();
    await expect(taskCheckbox(page, "Зал")).toBeChecked();
    await expect(taskCheckbox(page, "Бег")).not.toBeChecked();

    await button(page, "Скрыть").click();

    await expect(textOf(page, PARTIAL_FAILURE)).toBeHidden();
  });
});

test("12. «Переименовать» в меню «Действия с проектом Спорт» меняет заголовок группы на «Бег и зал», «В архив» в меню «Учёба» убирает группу", async ({
  page,
}) => {
  await sportStudyLanguages(page);
  await openTasksPage(page);

  await button(page, "Действия с проектом Спорт").click();
  await menuItem(page, "Переименовать").click();
  const form = dialog(page, "Изменить проект");
  await field(form, "Название").fill("Бег и зал");
  await button(form, "Сохранить").click();
  await expect(form).toBeHidden();

  await expect(groupHeading(page, "Бег и зал")).toBeVisible();
  await expectGroupsHidden(page, ["Спорт"]);

  await button(page, "Действия с проектом Учёба").click();
  await menuItem(page, "В архив").click();

  await expectGroupsHidden(page, ["Учёба"]);
});

test("13. «Новая задача» создаёт «Отчёт» в «Спорт» без запуска таймера, «Новый проект» «Музыка» добавляет группу с «В проекте пока нет задач»", async ({
  page,
}) => {
  await createProject(page, { name: "Спорт" });
  await openTasksPage(page);

  await button(page, "Новая задача").click();
  const taskForm = dialog(page, "Новая задача");
  const projectList = field(taskForm, "Проект");
  await expect(
    projectList.getByRole("option", { name: "Без проекта", selected: true }),
  ).toHaveCount(1);
  await field(taskForm, "Название").fill("Отчёт");
  await projectList.selectOption({ label: "Спорт" });
  await button(taskForm, "Создать").click();
  await expect(taskForm).toBeHidden();

  await expectInSection(page, "Спорт", link(page, "Отчёт"));
  expect(await activeTimers(page)).toEqual([]);

  await button(page, "Новый проект").click();
  const projectForm = dialog(page, "Новый проект");
  await field(projectForm, "Название").fill("Музыка");
  await button(projectForm, "Создать").click();
  await expect(projectForm).toBeHidden();

  await expectInSection(page, "Музыка", textOf(page, "В проекте пока нет задач"));
});

test("14. без проектов и задач «Пока нет задач», «Выбрать все» выключен", async ({ page }) => {
  await openTasksPage(page);

  await expect(textOf(page, "Пока нет задач")).toBeVisible();
  await expect(selectAllCheckbox(page)).toBeDisabled();
});

test("15. без сети «Перенести» и «В архив» в регионе, «Изменить задачу: Anki» и «В архив: Anki» в строке неактивны, когда сеть вернулась, активны", async ({
  page,
  context,
}) => {
  await createProject(page, { name: "Спорт" });
  await createTask(page, { title: "Anki" });
  await openTasksPage(page);
  await selectTasks(page, ["Anki"]);
  await moveTargetField(page).selectOption({ label: "Спорт" });
  const panel = selectedTasks(page);
  const offlineSensitive = [
    button(panel, "Перенести"),
    button(panel, "В архив"),
    editTaskButton(page, "Anki"),
    archiveTaskButton(page, "Anki"),
  ];
  for (const target of offlineSensitive) {
    await expect(target).toBeEnabled();
  }

  await context.setOffline(true);

  for (const target of offlineSensitive) {
    await expect(target).toBeDisabled();
  }

  await context.setOffline(false);

  for (const target of offlineSensitive) {
    await expect(target).toBeEnabled();
  }
});
