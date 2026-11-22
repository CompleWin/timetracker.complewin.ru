import { expect, test, type Locator, type Page } from "@playwright/test";
import { addLocalSession, dayMonthRu, localIso, loginInZone } from "./helpers/afternoon.ts";
import { createTask } from "./helpers/api.ts";
import { expectNoHorizontalScroll, PHONE_VIEWPORT } from "./helpers/layout.ts";
import { boxOf } from "./helpers/picker-size.ts";
import { sessionBlock, timeScale, timeline, zoneAtHour } from "./helpers/timeline.ts";
import { button, group, heading, region, textOf } from "./helpers/ui.ts";

const ZONE = zoneAtHour(13);
const PREVIOUS_MONTH = "Предыдущий месяц";
const NEXT_MONTH = "Следующий месяц";
const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const MONTH_FORMAT = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", month: "long" });

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

function localDate(daysAgo = 0): Date {
  return new Date(localIso(ZONE, "12:00", daysAgo).slice(0, 10));
}

function monthName(date: Date): string {
  const month = MONTH_FORMAT.format(date);
  return `${month.charAt(0).toLocaleUpperCase("ru")}${month.slice(1)} ${date.getUTCFullYear()}`;
}

function pickDay(page: Page, date = localDate()): Locator {
  return button(timeline(page), `Выбрать день: ${DATE_FORMAT.format(date)}`);
}

function calendarDay(calendar: Locator, date: Date): Locator {
  return button(calendar, DATE_FORMAT.format(date));
}

function weekDay(page: Page, date: Date): Locator {
  return button(group(page, "Неделя"), DATE_FORMAT.format(date));
}

async function openCalendar(page: Page): Promise<Locator> {
  await page.goto("/");
  await pickDay(page).click();
  const calendar = region(page, "Календарь");
  await expect(calendar).toBeVisible();
  return calendar;
}

test("1. в строке «Хронология» видна закрытая кнопка с сегодняшней датой", async ({ page }) => {
  await page.goto("/");

  const trigger = pickDay(page);
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveText(DATE_FORMAT.format(localDate()));
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("2. открывается текущий месяц, сегодняшний день выбран и в фокусе", async ({ page }) => {
  const calendar = await openCalendar(page);

  await expect(textOf(calendar, monthName(localDate()))).toBeVisible();
  await expect(calendar.getByRole("heading")).toHaveCount(0);
  await expect(pickDay(page)).toHaveAttribute("aria-expanded", "true");
  const today = calendarDay(calendar, localDate());
  await expect(today).toBeFocused();
  await expect(today).toHaveAttribute("aria-pressed", "true");
  await expect(today).toHaveAttribute("aria-current", "date");

  const panel = await boxOf(calendar);
  const scale = await boxOf(timeScale(page));
  const overlap = {
    x: (Math.max(panel.x, scale.x) + Math.min(panel.x + panel.width, scale.x + scale.width)) / 2,
    y: (Math.max(panel.y, scale.y) + Math.min(panel.y + panel.height, scale.y + scale.height)) / 2,
  };
  expect(
    await calendar.evaluate(
      (element, { x, y }) => element.contains(document.elementFromPoint(x, y)),
      overlap,
    ),
  ).toBe(true);
});

test("3. из текущего месяца нельзя перейти в следующий или выбрать завтрашний день", async ({
  page,
}) => {
  const calendar = await openCalendar(page);
  const today = localDate();
  const tomorrow = localDate(-1);

  await expect(button(calendar, NEXT_MONTH)).toBeDisabled();
  if (today.getUTCMonth() === tomorrow.getUTCMonth()) {
    await expect(calendarDay(calendar, tomorrow)).toBeDisabled();
  } else {
    await expect(calendarDay(calendar, tomorrow)).toHaveCount(0);
  }
});

test("4. выбор вчерашнего дня закрывает календарь, возвращает фокус и обновляет неделю, хронологию и сводку", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "16:00", end: "16:30", daysAgo: 1 });
  const calendar = await openCalendar(page);
  const yesterday = localDate(1);

  if (yesterday.getUTCMonth() !== localDate().getUTCMonth()) {
    await button(calendar, PREVIOUS_MONTH).click();
  }
  await calendarDay(calendar, yesterday).click();

  await expect(calendar).toHaveCount(0);
  const trigger = pickDay(page, yesterday);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText(DATE_FORMAT.format(yesterday));
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(weekDay(page, yesterday)).toHaveAttribute("aria-pressed", "true");
  await expect(sessionBlock(page, "Anki", "16:00–16:30")).toBeVisible();
  await expect(heading(page, `Сводка за ${dayMonthRu(ZONE, 1)}`)).toBeVisible();
});

test("5. можно выбрать 15-е число месяца двумя месяцами раньше", async ({ page }) => {
  const calendar = await openCalendar(page);
  const today = localDate();
  const previous = button(calendar, PREVIOUS_MONTH);
  const next = button(calendar, NEXT_MONTH);
  const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 15));
  const selectedDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 15));

  await previous.click();
  await previous.click();

  await expect(textOf(calendar, monthName(selectedDate))).toBeVisible();
  await expect(next).toBeEnabled();
  await expect(weekDay(page, today)).toHaveAttribute("aria-pressed", "true");
  await next.click();
  await expect(textOf(calendar, monthName(lastMonth))).toBeVisible();
  await previous.click();
  await calendarDay(calendar, selectedDate).click();

  const trigger = pickDay(page, selectedDate);
  await expect(trigger).toHaveText(DATE_FORMAT.format(selectedDate));
  await expect(weekDay(page, selectedDate)).toHaveAttribute("aria-pressed", "true");
  await trigger.click();
  await expect(textOf(calendar, monthName(selectedDate))).toBeVisible();
  await expect(calendarDay(calendar, selectedDate)).toBeFocused();
  await expect(calendarDay(calendar, selectedDate)).toHaveAttribute("aria-pressed", "true");
});

test("6. Esc после листания закрывает календарь, сохраняет день и возвращает фокус", async ({
  page,
}) => {
  const calendar = await openCalendar(page);
  const previous = button(calendar, PREVIOUS_MONTH);
  await previous.click();
  await previous.click();

  await page.keyboard.press("Escape");

  await expect(calendar).toHaveCount(0);
  await expect(pickDay(page)).toBeFocused();
  await expect(pickDay(page)).toHaveAttribute("aria-expanded", "false");
  await expect(weekDay(page, localDate())).toHaveAttribute("aria-pressed", "true");
});

test("7. клик по заголовку «Хронология» закрывает календарь", async ({ page }) => {
  const calendar = await openCalendar(page);

  await heading(page, "Хронология").click();

  await expect(calendar).toHaveCount(0);
  await expect(pickDay(page)).toHaveAttribute("aria-expanded", "false");
});

test("8. повторный клик по кнопке даты закрывает календарь", async ({ page }) => {
  const calendar = await openCalendar(page);
  const trigger = pickDay(page);

  await trigger.click();

  await expect(calendar).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("9. при ширине 390 px календарь виден целиком без горизонтальной прокрутки", async ({
  page,
}) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  const calendar = await openCalendar(page);

  await expect(calendar).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => calendar.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBe(0);
  await expectNoHorizontalScroll(page);
});
