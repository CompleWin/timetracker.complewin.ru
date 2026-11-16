import { expect, test, type Locator, type Page } from "@playwright/test";
import { createProject, createTask, startTimer, type Session } from "./helpers/api.ts";
import {
  addLocalSession,
  afternoonZone,
  localInput,
  localTime,
  loginInZone,
  weekdayDateRu,
} from "./helpers/afternoon.ts";
import { expectNoHorizontalScroll, PHONE_VIEWPORT } from "./helpers/layout.ts";
import { button, dialog, expectInSection, field, heading, link, textOf } from "./helpers/ui.ts";
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
  await expect(field(form, "Задача").getByRole("option", { selected: true })).toHaveText("Бег");

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

test("38. «Добавить вручную» и «Сессия» открывают «Новая сессия» с пустыми «Начало» и «Конец»; в «Задача» варианты «<название> · <проект>» и «<название>»", async ({
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
    const tasks = field(form, "Задача");
    await expect(
      tasks.getByRole("option", { name: "Беговая дорожка · Спорт", exact: true }),
    ).toHaveCount(1);
    await expect(tasks.getByRole("option", { name: "Anki", exact: true })).toHaveCount(1);

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

  await expect(field(form, "Задача")).toHaveValue("");
  await field(form, "Начало").fill(localInput(ZONE, "10:00"));
  await field(form, "Конец").fill(localInput(ZONE, "10:40"));
  await expect(save).toBeDisabled();

  await field(form, "Задача").selectOption({ label: "Anki" });
  await expect(save).toBeEnabled();
});
