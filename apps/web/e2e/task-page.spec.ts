import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addSession,
  archiveProject,
  archiveTask,
  createProject,
  createTask,
  setTimeZone,
  startTimer,
  type Project,
  type Session,
  type Task,
} from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { clockIn, expectClockTicks } from "./helpers/clock.ts";
import { MOSCOW_TIME_ZONE, moscowDate, moscowIso, moscowTime } from "./helpers/moscow-time.ts";
import { openPicker } from "./helpers/picker.ts";
import { button, dialog, heading, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type SessionFormInput = {
  start: string;
  end: string;
  note?: string;
};

type TaskInProject = {
  task: Task;
  project: Project;
};

type Deactivate = (page: Page, target: TaskInProject) => Promise<unknown>;

const PAST_DAY = "2026-10-30";
const PAST_DAY_SHOWN = "30.10.2026";
const FUTURE_DAY = "2099-10-30";
const MISSING_TASK_ID = "00000000-0000-4000-8000-000000000000";
const NOTE = "повторил 50 карточек";

const dialogErrors: [situation: string, input: SessionFormInput, message: string][] = [
  [
    "сессия, пересекающаяся с существующей,",
    { start: onPastDay("10:30"), end: onPastDay("11:30") },
    "Пересекается с другой сессией этой задачи",
  ],
  [
    "конец, равный началу,",
    { start: onPastDay("12:00"), end: onPastDay("12:00") },
    "Конец должен быть позже начала",
  ],
  [
    "время в будущем",
    { start: `${FUTURE_DAY}T10:00`, end: `${FUTURE_DAY}T10:40` },
    "Нельзя указать время в будущем",
  ],
];

const deactivations: [kind: string, deactivate: Deactivate][] = [
  ["в архиве", (page, { task }) => archiveTask(page, task.id)],
  ["в архивном проекте", (page, { project }) => archiveProject(page, project.id)],
];

function onPastDay(time: string): string {
  return `${PAST_DAY}T${time}`;
}

function taskPage(task: Task): string {
  return `/tasks/${task.id}`;
}

function addPastSession(page: Page, task: Task, start: string, end: string): Promise<Session> {
  return addSession(page, task.id, {
    startedAt: moscowIso(onPastDay(start)),
    endedAt: moscowIso(onPastDay(end)),
  });
}

function runningRange(session: Session): string {
  return `${moscowTime(session.startedAt)}–идёт`;
}

function runningEditLabel(session: Session): string {
  return `Изменить сессию ${moscowDate(session.startedAt)} ${runningRange(session)}`;
}

function editPastSession(page: Page, range: string): Locator {
  return button(page, `Изменить сессию ${PAST_DAY_SHOWN} ${range}`);
}

function sessionEditButtons(page: Page): Locator {
  return page.getByRole("button", { name: /^Изменить сессию / });
}

function sessionRow(page: Page, editButton: Locator, range: string): Locator {
  return page
    .locator("*")
    .filter({ has: editButton })
    .filter({ has: textOf(page, range) })
    .last();
}

function field(form: Locator, label: string): Locator {
  return form.getByLabel(label, { exact: true });
}

async function openNewSession(page: Page): Promise<Locator> {
  await button(page, "Добавить сессию").click();
  const form = dialog(page, "Новая сессия");
  await expect(form).toBeVisible();
  return form;
}

async function submitSession(form: Locator, { start, end, note }: SessionFormInput): Promise<void> {
  await field(form, "Начало").fill(start);
  await field(form, "Конец").fill(end);
  if (note !== undefined) await field(form, "Заметка").fill(note);
  await button(form, "Сохранить").click();
}

test.use({ timezoneId: MOSCOW_TIME_ZONE });

test.beforeEach(async ({ page }) => {
  await loginAs(page);
  await setTimeZone(page, MOSCOW_TIME_ZONE);
});

test("13. «Открыть задачу: Anki» в панели выбора ведёт на её страницу: заголовок, «Без проекта», «Всего», кнопка-иконка «Запустить таймер: Anki» и список «Сессии»", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  await page.goto("/");
  await openPicker(page);

  await page.getByRole("link", { name: "Открыть задачу: Anki", exact: true }).click();

  await expect(page).toHaveURL(urlMatching(taskPage(task)));
  await expect(heading(page, "Anki")).toBeVisible();
  await expect(textOf(page, "Без проекта")).toBeVisible();
  await expect(textOf(page, "Всего: 0 мин")).toBeVisible();
  await expect(button(page, "Запустить таймер: Anki")).toBeVisible();
  await expect(button(page, "Запустить таймер: Anki")).not.toContainText("Старт");
  await expect(heading(page, "Сессии")).toBeVisible();
});

test("13. «Добавить сессию» 10:00–10:40 с заметкой «повторил 50 карточек» показывает сессию в списке, «Всего» растёт на 40 минут", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  await addPastSession(page, task, "08:00", "09:00");
  await page.goto(taskPage(task));
  await expect(textOf(page, "Всего: 1 ч")).toBeVisible();

  const form = await openNewSession(page);
  await submitSession(form, { start: onPastDay("10:00"), end: onPastDay("10:40"), note: NOTE });

  await expect(form).toBeHidden();
  await expect(editPastSession(page, "10:00–10:40")).toBeVisible();
  for (const text of ["10:00–10:40", "40 мин", NOTE]) {
    await expect(textOf(page, text)).toBeVisible();
  }
  await expect(textOf(page, "Всего: 1 ч 40 мин")).toBeVisible();
});

for (const [situation, input, message] of dialogErrors) {
  test(`14. ${situation} показывает «${message}»`, async ({ page }) => {
    const task = await createTask(page, { title: "Anki" });
    await addPastSession(page, task, "10:00", "11:00");
    await page.goto(taskPage(task));

    const form = await openNewSession(page);
    await submitSession(form, input);

    await expect(textOf(form, message)).toBeVisible();
  });
}

test("15. «Изменить», «Удалить» и подтверждение убирают сессию из списка", async ({ page }) => {
  const task = await createTask(page, { title: "Anki" });
  await addPastSession(page, task, "10:00", "10:40");
  await page.goto(taskPage(task));

  await editPastSession(page, "10:00–10:40").click();
  await button(dialog(page, "Сессия"), "Удалить").click();
  await button(dialog(page, "Удалить сессию?"), "Удалить").click();

  await expect(editPastSession(page, "10:00–10:40")).toHaveCount(0);
  await page.reload();
  await expect(textOf(page, "Всего: 0 мин")).toBeVisible();
  await expect(editPastSession(page, "10:00–10:40")).toHaveCount(0);
});

test("20. у верхней сессии идущего таймера видны «идёт» и тикающие часы, есть «Изменить сессию <дата> <начало>–идёт»", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  await addPastSession(page, task, "10:00", "10:40");
  const running = await startTimer(page, task.id);
  await page.goto(taskPage(task));

  await expect(sessionEditButtons(page).first()).toHaveAccessibleName(runningEditLabel(running));
  const row = sessionRow(page, button(page, runningEditLabel(running)), runningRange(running));
  await expect(textOf(row, runningRange(running))).toBeVisible();
  await expectClockTicks(clockIn(row));
});

test("20. в диалоге «Сессия» идущей сессии «Конец» пуст, и «Сохранить» без конца оставляет сессию идущей", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  const running = await startTimer(page, task.id);
  await page.goto(taskPage(task));

  await button(page, runningEditLabel(running)).click();
  const form = dialog(page, "Сессия");
  await expect(field(form, "Конец")).toHaveValue("");
  await field(form, "Заметка").fill(NOTE);
  await button(form, "Сохранить").click();

  await expect(form).toBeHidden();
  await expect(textOf(page, NOTE)).toBeVisible();
  await expect(textOf(page, runningRange(running))).toBeVisible();
});

test("21. в диалоге «Новая сессия» «Сохранить» выключена, пока не заполнены «Начало» и «Конец»", async ({
  page,
}) => {
  const task = await createTask(page, { title: "Anki" });
  await page.goto(taskPage(task));
  const form = await openNewSession(page);
  const start = field(form, "Начало");
  const end = field(form, "Конец");
  const save = button(form, "Сохранить");

  await start.fill("");
  await end.fill("");
  await expect(save).toBeDisabled();

  await start.fill(onPastDay("10:00"));
  await expect(save).toBeDisabled();

  await end.fill(onPastDay("10:40"));
  await expect(save).toBeEnabled();

  await start.fill("");
  await expect(save).toBeDisabled();
});

test("22. /tasks/<несуществующий UUID> переходит на главную", async ({ page }) => {
  await page.goto(`/tasks/${MISSING_TASK_ID}`);

  await expect(page).toHaveURL(urlMatching("/"));
});

test("22. страница чужой задачи переходит на главную", async ({ page }) => {
  const task = await createTask(page, { title: "Anki" });
  await loginAs(page);

  await page.goto(taskPage(task));

  await expect(page).toHaveURL(urlMatching("/"));
});

for (const [kind, deactivate] of deactivations) {
  test(`22. на странице задачи ${kind} нет «Запустить таймер: Беговая дорожка» и «Добавить сессию», а «Изменить сессию» есть`, async ({
    page,
  }) => {
    const project = await createProject(page, { name: "Спорт" });
    const task = await createTask(page, { title: "Беговая дорожка", projectId: project.id });
    await addPastSession(page, task, "10:00", "10:40");
    await deactivate(page, { task, project });

    await page.goto(taskPage(task));

    await expect(heading(page, "Беговая дорожка")).toBeVisible();
    await expect(editPastSession(page, "10:00–10:40")).toBeVisible();
    await expect(button(page, "Запустить таймер: Беговая дорожка")).toHaveCount(0);
    await expect(button(page, "Добавить сессию")).toHaveCount(0);
  });
}
