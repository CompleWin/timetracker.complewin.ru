import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  activeTimers,
  createProject,
  createTask,
  pinTask,
  startTimer,
  type Session,
} from "./helpers/api.ts";
import {
  addLocalSession,
  afternoonZone,
  localInput,
  localTime,
  loginInZone,
  weekdayDateRu,
} from "./helpers/afternoon.ts";
import { expectNoHorizontalScroll, PHONE_VIEWPORT } from "./helpers/layout.ts";
import { boxOf } from "./helpers/picker-size.ts";
import {
  button,
  dialog,
  expectInSection,
  field,
  group,
  heading,
  link,
  textOf,
} from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const ZONE = afternoonZone();
const SESSION_BLOCK = /^Изменить сессию /;
const FILL_GAP = /^Заполнить пропуск /;

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

function sessionBlock(page: Page, title: string, range: string): Locator {
  return button(page, `Изменить сессию ${title}, ${range}`);
}

function fillGapButton(page: Page, range: string): Locator {
  return button(page, `Заполнить пропуск ${range}`);
}

function showGapsCheckbox(page: Page): Locator {
  return page.getByRole("checkbox", { name: "Показывать пропуски", exact: true });
}

async function setShowGaps(page: Page, show: boolean): Promise<void> {
  const saved = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "PATCH" &&
      new URL(response.url()).pathname === "/api/me" &&
      request.postDataJSON()?.showGaps === show
    );
  });
  await showGapsCheckbox(page).setChecked(show);
  expect((await saved).status()).toBe(200);
}

function runningRange(running: Session): string {
  return `${localTime(ZONE, running.startedAt)}–идёт`;
}

async function openNewSessionWith(page: Page, opener: string): Promise<Locator> {
  await button(page, opener).click();
  const form = dialog(page, "Новая сессия");
  await expect(form).toBeVisible();
  return form;
}

async function openSessionTaskPicker(form: Locator): Promise<Locator> {
  const taskField = form.getByRole("button", { name: /^Задача: / });
  await expect(taskField).toHaveAttribute("aria-expanded", "false");
  await taskField.click();
  await expect(taskField).toHaveAttribute("aria-expanded", "true");
  return form.getByRole("region", { name: "Выбор задачи", exact: true });
}

test("35. в «Хронологии» сегодняшняя дата, блоки двух остановленных и идущей сессии, между остановленными «Пропуск 45 мин» и «Заполнить пропуск», вчерашней сессии нет", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  const run = await createTask(page, { title: "Бег" });
  await addLocalSession(page, ZONE, anki.id, { start: "16:00", end: "16:30", daysAgo: 1 });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
  await addLocalSession(page, ZONE, anki.id, { start: "11:15", end: "11:45" });
  const running = await startTimer(page, run.id);

  await page.goto("/");

  await expectInSection(page, "Хронология", textOf(page, weekdayDateRu(ZONE)));
  await expect(page.getByRole("button", { name: SESSION_BLOCK })).toHaveCount(3);
  await expect(sessionBlock(page, "Anki", "10:00–10:30")).toHaveAttribute(
    "title",
    "Изменить сессию Anki, 10:00–10:30",
  );
  await expect(sessionBlock(page, "Anki", "11:15–11:45")).toBeVisible();
  await expect(sessionBlock(page, "Бег", runningRange(running))).toBeVisible();
  await expect(textOf(page, "Пропуск 45 мин")).toBeVisible();
  await expect(fillGapButton(page, "10:30–11:15")).toBeVisible();
  await expect(sessionBlock(page, "Anki", "16:00–16:30")).toHaveCount(0);
});

test("35. пауза 15 мин между сессиями пропуска не даёт", async ({ page }) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:45", end: "11:15" });

  await page.goto("/");

  await expect(sessionBlock(page, "Anki", "10:45–11:15")).toBeVisible();
  await expect(page.getByRole("button", { name: FILL_GAP })).toHaveCount(0);
  await expect(page.getByText(/^Пропуск /)).toHaveCount(0);
});

test("36. блок сессии открывает «Сессия» с её началом, концом, строкой задачи и «К задаче»; новое время конца видно в имени блока", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
  await page.goto("/");

  await sessionBlock(page, "Anki", "10:00–10:30").click();

  const form = dialog(page, "Сессия");
  await expect(field(form, "Начало")).toHaveValue(localInput(ZONE, "10:00"));
  await expect(field(form, "Конец")).toHaveValue(localInput(ZONE, "10:30"));
  await expect(textOf(form, "Anki")).toBeVisible();
  await expect(link(form, "К задаче")).toBeVisible();

  await field(form, "Конец").fill(localInput(ZONE, "10:20"));
  await button(form, "Сохранить").click();

  await expect(form).toBeHidden();
  await expect(sessionBlock(page, "Anki", "10:00–10:20")).toBeVisible();
});

test("36. «К задаче» в диалоге «Сессия» открывает страницу задачи", async ({ page }) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
  await page.goto("/");
  await sessionBlock(page, "Anki", "10:00–10:30").click();

  await link(dialog(page, "Сессия"), "К задаче").click();

  await expect(page).toHaveURL(urlMatching(`/tasks/${anki.id}`));
});

test("37. «Заполнить пропуск» открывает «Новая сессия» с границами пропуска и последней запущенной задачей, после сохранения пропуска нет, а новая сессия слита с соседней сессией этой задачи в один блок", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  const run = await createTask(page, { title: "Бег" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
  await addLocalSession(page, ZONE, run.id, { start: "11:15", end: "11:45" });
  await page.goto("/");

  const form = await openNewSessionWith(page, "Заполнить пропуск 10:30–11:15");

  await expect(field(form, "Начало")).toHaveValue(localInput(ZONE, "10:30"));
  await expect(field(form, "Конец")).toHaveValue(localInput(ZONE, "11:15"));
  await expect(button(form, "Задача: Бег")).toBeVisible();

  await button(form, "Сохранить").click();

  await expect(form).toBeHidden();
  await expect(fillGapButton(page, "10:30–11:15")).toHaveCount(0);
  await expect(sessionBlock(page, "Бег", "10:30–11:45")).toBeVisible();
  await expect(sessionBlock(page, "Бег", "10:30–11:15")).toHaveCount(0);
});

test("STT-37. флажок в настройках скрывает и возвращает пропуски и сохраняет значение после перезагрузки", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
  await addLocalSession(page, ZONE, anki.id, { start: "11:15", end: "11:45" });
  await page.goto("/settings");

  const sections = page.getByRole("navigation", { name: "Разделы настроек", exact: true });
  const expectedOrder = ["Notion", "Telegram-бот", "Хронология", "Язык"];
  await expect(sections.getByRole("link")).toContainText(expectedOrder);
  await link(sections, "Хронология").click();
  await expect(heading(page, "Хронология")).toBeInViewport();
  await expect(showGapsCheckbox(page)).toBeChecked();
  await expect(
    textOf(page, "Пустое время между сессиями от 20 минут, его можно заполнить в один клик"),
  ).toBeVisible();

  await context.setOffline(true);
  await expect(showGapsCheckbox(page)).toBeDisabled();
  await context.setOffline(false);

  await setShowGaps(page, false);
  await page.reload();
  await expect(showGapsCheckbox(page)).not.toBeChecked();
  await page.goto("/");

  await expect(sessionBlock(page, "Anki", "10:00–10:30")).toBeVisible();
  await expect(sessionBlock(page, "Anki", "11:15–11:45")).toBeVisible();
  await expect(textOf(page, "Пропуск 45 мин")).toHaveCount(0);
  await expect(fillGapButton(page, "10:30–11:15")).toHaveCount(0);

  await page.goto("/settings");
  await setShowGaps(page, true);
  await page.goto("/");
  await expect(textOf(page, "Пропуск 45 мин")).toBeVisible();
  await expect(fillGapButton(page, "10:30–11:15")).toBeVisible();
});

test("STT-37. крестик скрывает один пропуск до изменения его границ", async ({ page, context }) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
  await addLocalSession(page, ZONE, anki.id, { start: "11:15", end: "11:45" });
  await addLocalSession(page, ZONE, anki.id, { start: "12:30", end: "13:00" });
  await page.goto("/");

  const hideLabel = "Скрыть пропуск 10:30–11:15";
  const hideGap = button(page, hideLabel);
  const targetGap = fillGapButton(page, "10:30–11:15");
  const otherGap = fillGapButton(page, "11:45–12:30");
  await expect(hideGap).toBeVisible();
  await expect(hideGap).toHaveAttribute("title", hideLabel);
  await expect(textOf(page, "Пропуск 45 мин")).toHaveCount(2);

  await context.setOffline(true);
  await expect(hideGap).toBeDisabled();
  await expect(targetGap).toBeDisabled();
  await context.setOffline(false);

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/hidden-gaps",
  );
  await hideGap.click();
  await expect(targetGap).toHaveCount(0);
  await expect(textOf(page, "Пропуск 45 мин")).toHaveCount(1);
  await expect(otherGap).toBeVisible();
  await expect(sessionBlock(page, "Anki", "10:00–10:30")).toBeVisible();
  await expect(sessionBlock(page, "Anki", "11:15–11:45")).toBeVisible();
  expect((await saved).status()).toBe(204);

  await page.reload();
  await expect(otherGap).toBeVisible();
  await expect(targetGap).toHaveCount(0);

  await page.goto("/settings");
  await setShowGaps(page, false);
  await setShowGaps(page, true);
  await page.goto("/");
  await expect(otherGap).toBeVisible();
  await expect(targetGap).toHaveCount(0);

  await sessionBlock(page, "Anki", "11:15–11:45").click();
  const form = dialog(page, "Сессия");
  await field(form, "Начало").fill(localInput(ZONE, "11:20"));
  await button(form, "Сохранить").click();

  await expect(form).toBeHidden();
  await expect(textOf(page, "Пропуск 50 мин")).toBeVisible();
  await expect(fillGapButton(page, "10:30–11:20")).toBeVisible();
});

test("STT-37. на телефоне можно скрыть видимый пропуск после короткой сессии", async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:29", end: "10:30" });
  await addLocalSession(page, ZONE, anki.id, { start: "11:25", end: "11:55" });
  await page.goto("/");

  const hideGap = button(page, "Скрыть пропуск 10:30–11:25");
  await expect(hideGap).toBeVisible();
  await expectNoHorizontalScroll(page);
  await hideGap.click();
  await expect(fillGapButton(page, "10:30–11:25")).toHaveCount(0);

  await sessionBlock(page, "Anki", "10:29–10:30").click();
  await expect(dialog(page, "Сессия")).toBeVisible();
});

test("38. «Добавить вручную» и «Сессия» открывают пустую форму с панелью выбора задачи", async ({
  page,
}) => {
  const sport = await createProject(page, { name: "Спорт" });
  await createTask(page, { title: "Беговая дорожка", projectId: sport.id });
  await createTask(page, { title: "Anki" });
  await page.goto("/");

  for (const opener of ["Добавить вручную", "Сессия"]) {
    const form = await openNewSessionWith(page, opener);

    await expect(field(form, "Начало")).toHaveValue("");
    await expect(field(form, "Конец")).toHaveValue("");
    await expect(textOf(form, "Задача")).toBeVisible();
    const picker = await openSessionTaskPicker(form);
    const tree = group(picker, "Проекты и задачи");
    await button(tree, "Без проекта").click();
    await expect(button(group(tree, "Без проекта"), "Выбрать задачу: Anki")).toBeVisible();

    await button(group(tree, "Спорт"), "Выбрать задачу: Беговая дорожка").click();

    await expect(picker).toBeHidden();
    await expect(button(form, "Задача: Беговая дорожка · Спорт")).toBeVisible();

    await button(form, "Закрыть").click();
    await expect(form).toBeHidden();
  }
});

test("38. у пользователя, который ничего не запускал, задача не выбрана и «Сохранить» выключена при заполненных начале и конце", async ({
  page,
}) => {
  await createTask(page, { title: "Anki" });
  await page.goto("/");
  const form = await openNewSessionWith(page, "Добавить вручную");
  const save = button(form, "Сохранить");

  await expect(button(form, "Задача: Выбери задачу")).toBeVisible();
  await field(form, "Начало").fill(localInput(ZONE, "10:00"));
  await field(form, "Конец").fill(localInput(ZONE, "10:40"));
  await expect(save).toBeDisabled();

  const picker = await openSessionTaskPicker(form);
  await button(group(picker, "Без проекта"), "Выбрать задачу: Anki").click();
  await expect(save).toBeEnabled();
  await save.click();

  await expect(form).toBeHidden();
  await expect(sessionBlock(page, "Anki", "10:00–10:40")).toBeVisible();
});

test("STT-38. в панели диалога работает поиск с клавиатуры, Enter выбирает задачу", async ({
  page,
}) => {
  const sport = await createProject(page, { name: "Спорт" });
  await createTask(page, { title: "Беговая дорожка", projectId: sport.id });
  await createTask(page, { title: "Разминка", projectId: sport.id });
  await createTask(page, { title: "Anki" });
  await page.goto("/");

  const form = await openNewSessionWith(page, "Добавить вручную");
  const picker = await openSessionTaskPicker(form);
  const search = field(picker, "Поиск задач");
  await expect(search).toHaveAttribute("placeholder", "Найди задачу");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await page.keyboard.press("KeyN");
  await expect(search).toHaveValue("n");
  await expect(form).toBeVisible();

  await search.fill("xyz");
  await expect(textOf(picker, "Таких задач нет")).toBeVisible();
  await expect(button(picker, "Создать «xyz»")).toHaveCount(0);
  await search.press("Tab");
  await expect(field(form, "Начало")).toBeFocused();
  await expect(picker).toBeHidden();

  await openSessionTaskPicker(form);
  const found = group(picker, "Найдено");
  const treadmill = button(found, "Выбрать задачу: Беговая дорожка");
  await search.fill("#спорт");
  await expect(treadmill).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(button(form, "Задача: Разминка · Спорт")).toBeFocused();

  await openSessionTaskPicker(form);
  await search.fill("бег");
  await expect(treadmill).toBeVisible();
  await expect(button(found, "Выбрать задачу: Anki")).toHaveCount(0);
  await search.press("Enter");

  const taskField = button(form, "Задача: Беговая дорожка · Спорт");
  await expect(picker).toBeHidden();
  await expect(taskField).toHaveAttribute("aria-expanded", "false");
  await expect(taskField).toBeFocused();
  expect(await activeTimers(page)).toHaveLength(0);
});

test("STT-38. «Добавить вручную» предлагает последнюю задачу, Esc и клик мимо сохраняют выбор", async ({
  page,
}) => {
  const run = await createTask(page, { title: "Бег" });
  await startTimer(page, run.id);
  await page.goto("/");

  const form = await openNewSessionWith(page, "Добавить вручную");
  const taskField = button(form, "Задача: Бег");
  await expect(taskField).toBeVisible();
  const picker = await openSessionTaskPicker(form);

  await page.keyboard.press("Escape");

  await expect(form).toBeVisible();
  await expect(picker).toBeHidden();
  await expect(taskField).toHaveAttribute("aria-expanded", "false");
  await expect(taskField).toBeFocused();

  await openSessionTaskPicker(form);
  await heading(form, "Новая сессия").click();

  await expect(picker).toBeHidden();
  await expect(taskField).toHaveAttribute("aria-expanded", "false");
});

test("STT-38. в панели можно выбрать закреплённую и идущую задачу, действий запуска нет", async ({
  page,
}) => {
  const sport = await createProject(page, { name: "Спорт" });
  const run = await createTask(page, { title: "Бег", projectId: sport.id });
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, run.id, { start: "10:00", end: "10:30" });
  await pinTask(page, run.id);
  const running = await startTimer(page, anki.id);
  await page.goto("/");

  const form = await openNewSessionWith(page, "Добавить вручную");
  const picker = await openSessionTaskPicker(form);
  const recent = group(picker, "Недавние");
  const recentRun = button(recent, "Выбрать задачу: Бег");
  await expect(textOf(recentRun, "Спорт")).toBeVisible();
  await expect(textOf(recentRun, "30 мин")).toBeVisible();
  await expect(group(picker, "Проекты и задачи")).toBeVisible();
  await expect(textOf(picker, "выбор")).toBeVisible();
  await expect(picker.getByText(/^Esc\s*закрыть$/)).toBeVisible();
  await expect(picker.getByText(/сразу в проект$/)).toHaveCount(0);

  for (const name of [
    "Создать",
    "Новая задача",
    "Новый проект",
    "Добавить из Notion",
    "Закрепить: Anki",
    "Открепить: Бег",
    "Действия с проектом Спорт",
    "Изменить размер панели",
    "Уже идёт: Anki",
  ]) {
    await expect(button(picker, name)).toHaveCount(0);
  }
  await expect(link(picker, "Открыть задачу: Anki")).toHaveCount(0);

  await button(group(picker, "Закреплённые"), "Выбрать задачу: Бег").click();
  await expect(button(form, "Задача: Бег · Спорт")).toBeVisible();
  await openSessionTaskPicker(form);
  await button(recent, "Выбрать задачу: Anki").click();

  await expect(picker).toBeHidden();
  await expect(button(form, "Задача: Anki")).toBeFocused();
  expect((await activeTimers(page)).map((session) => session.id)).toEqual([running.id]);
});

for (const [viewport, pickerWidth] of [
  [{ width: 1280, height: 720 }, 640],
  [PHONE_VIEWPORT, 358],
] as const) {
  test(`STT-38. на ширине ${viewport.width} px панель шире поля и сохраняет размер диалога`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (let index = 1; index <= 10; index++) {
      const task = await createTask(page, {
        title: `Длинное название задачи ${index}, которое не помещается в одну строку на телефоне`,
      });
      await pinTask(page, task.id);
    }
    await page.goto("/");

    const form = await openNewSessionWith(page, "Добавить вручную");
    await page.evaluate(() => document.fonts.ready);
    const start = field(form, "Начало");
    const taskField = button(form, "Задача: Выбери задачу");
    const [formBox, startBox, taskFieldBox] = await Promise.all([
      boxOf(form),
      boxOf(start),
      boxOf(taskField),
    ]);
    const formScrollHeight = await form.evaluate((element) => element.scrollHeight);

    const picker = await openSessionTaskPicker(form);
    await expect(picker).toBeInViewport({ ratio: 1 });
    expect(await boxOf(form)).toEqual(formBox);
    expect(await form.evaluate((element) => element.scrollHeight)).toBe(formScrollHeight);
    expect(await boxOf(start)).toEqual(startBox);
    expect(await boxOf(taskField)).toEqual(taskFieldBox);

    const pickerBox = await boxOf(picker);
    expect(pickerBox.width).toBeCloseTo(pickerWidth, 0);
    expect(pickerBox.width).toBeGreaterThan(taskFieldBox.width);
    expect(pickerBox.x + pickerBox.width / 2).toBeCloseTo(
      taskFieldBox.x + taskFieldBox.width / 2,
      0,
    );
    expect(pickerBox.y).toBeGreaterThanOrEqual(taskFieldBox.y + taskFieldBox.height);
    expect(
      await picker.evaluate((element, box) => {
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return element.contains(hit);
      }, startBox),
    ).toBe(true);
    await expect
      .poll(() => picker.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBe(0);
    await expectNoHorizontalScroll(page);

    if (viewport.width > PHONE_VIEWPORT.width) {
      await page.setViewportSize(PHONE_VIEWPORT);
      await expect.poll(async () => (await boxOf(picker)).width).toBeCloseTo(358, 0);
      await expect(picker).toBeInViewport({ ratio: 1 });
      expect((await boxOf(picker)).x).toBeCloseTo(16, 0);
    }
  });
}
