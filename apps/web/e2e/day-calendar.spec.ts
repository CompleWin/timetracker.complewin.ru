import { expect, test, type Locator, type Page } from "@playwright/test";
import { addLocalSession, dayMonthRu, localIso, loginInZone } from "./helpers/afternoon.ts";
import { createTask, setTimeZone } from "./helpers/api.ts";
import { expectNoHorizontalScroll, PHONE_VIEWPORT } from "./helpers/layout.ts";
import { MOSCOW_TIME_ZONE } from "./helpers/moscow-time.ts";
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
const DESKTOP_VIEWPORT = { width: 768, height: 900 };
const REFRESH_INTERVAL_MS = 20_000;

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
  await expect(trigger).toHaveText(DATE_FORMAT.format(localDate()), { useInnerText: true });
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
  await expect(trigger).toHaveText(DATE_FORMAT.format(yesterday), { useInnerText: true });
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
  await expect(trigger).toHaveText(DATE_FORMAT.format(selectedDate), { useInnerText: true });
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

test.describe("Календарь при фиксированном времени", () => {
  test.use({ timezoneId: MOSCOW_TIME_ZONE, serviceWorkers: "block" });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("11. в полночь по Москве открытый октябрь и фокус на 15-м числе сохраняются", async ({
    page,
  }) => {
    const beforeMidnight = new Date("2026-11-30T20:59:50.000Z");
    const november30 = new Date("2026-11-30");
    const october15 = new Date("2026-10-15");
    const december1 = new Date("2026-12-01");
    const december2 = new Date("2026-12-02");
    await setTimeZone(page, MOSCOW_TIME_ZONE);
    await page.clock.install({ time: beforeMidnight.getTime() - 60_000 });
    await page.clock.pauseAt(beforeMidnight);
    await page.route("**/api/**", async (route) => {
      const response = await route.fetch();
      const serverNow = await page.evaluate(() => new Date().toISOString());
      await route.fulfill({
        response,
        headers: { ...response.headers(), "x-server-now": serverNow },
      });
    });
    await page.goto("/");
    await pickDay(page, november30).click();
    const calendar = region(page, "Календарь");
    const next = button(calendar, NEXT_MONTH);
    await expect(textOf(calendar, "Ноябрь 2026")).toBeVisible();
    await expect(calendarDay(calendar, november30)).toHaveAttribute("aria-current", "date");
    await expect(next).toBeDisabled();

    await button(calendar, PREVIOUS_MONTH).click();
    const october = textOf(calendar, "Октябрь 2026");
    const focusedDay = calendarDay(calendar, october15);
    await expect(october).toBeVisible();
    await focusedDay.focus();
    await expect(focusedDay).toBeFocused();

    await page.clock.runFor(REFRESH_INTERVAL_MS + 1_000);

    await expect(weekDay(page, december1)).toHaveAttribute("aria-current", "date");
    await expect(october).toBeVisible();
    await expect(focusedDay).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(calendar).toBeHidden();
    const selected = pickDay(page, october15);
    await expect(selected).toBeFocused();
    await expect(weekDay(page, october15)).toHaveAttribute("aria-pressed", "true");
    await expect(heading(page, "Сводка за 15 октября")).toBeVisible();

    await selected.click();
    await expect(october).toBeVisible();
    await next.click();
    await expect(textOf(calendar, "Ноябрь 2026")).toBeVisible();
    await expect(calendarDay(calendar, november30)).not.toHaveAttribute("aria-current", "date");
    await next.click();
    await expect(textOf(calendar, "Декабрь 2026")).toBeVisible();
    await expect(calendarDay(calendar, december1)).toHaveAttribute("aria-current", "date");
    await expect(calendarDay(calendar, december1)).toBeEnabled();
    await expect(calendarDay(calendar, december2)).toBeDisabled();
    await expect(next).toBeDisabled();
  });
});

test("11. листание недель сохраняет дату, сессии и сводку до выбора другого дня", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:20" });
  await addLocalSession(page, ZONE, anki.id, { start: "16:00", end: "16:30", daysAgo: 7 });
  await page.goto("/");

  const week = group(page, "Неделя");
  const todayBlock = sessionBlock(page, "Anki", "10:00–10:20");
  const pastBlock = sessionBlock(page, "Anki", "16:00–16:30");
  const todaySummary = heading(page, "Сводка за сегодня");
  const previousDay = weekDay(page, localDate(7));
  const nextWeek = button(week, "Следующая неделя");
  const previousWeek = button(week, "Предыдущая неделя");
  await expect(todayBlock).toBeVisible();

  await previousWeek.click();
  await expect(previousDay).toBeVisible();
  await expect(pickDay(page)).toBeVisible();
  await expect(todayBlock).toBeVisible();
  await expect(pastBlock).toBeHidden();
  await expect(todaySummary).toBeVisible();

  await nextWeek.click();
  await expect(weekDay(page, localDate())).toHaveAttribute("aria-pressed", "true");
  await expect(pickDay(page)).toBeVisible();
  await expect(todayBlock).toBeVisible();
  await expect(todaySummary).toBeVisible();

  await previousWeek.click();
  await previousDay.click();
  await expect(pickDay(page, localDate(7))).toBeVisible();
  await expect(todayBlock).toBeHidden();
  await expect(pastBlock).toBeVisible();
  await expect(heading(page, `Сводка за ${dayMonthRu(ZONE, 7)}`)).toBeVisible();
});

async function expectMobileDayIcon(trigger: Locator, date: Date): Promise<void> {
  const number = textOf(trigger, String(date.getUTCDate()));
  await expect(number).toBeVisible();
  await expect(trigger).toHaveAccessibleName(`Выбрать день: ${DATE_FORMAT.format(date)}`);
  const iconContainsNumber = await number.evaluate((element) => {
    const button = element.closest("button");
    if (!button) return false;

    const numberBox = element.getBoundingClientRect();
    const x = numberBox.x + numberBox.width / 2;
    const y = numberBox.y + numberBox.height / 2;
    return [...button.querySelectorAll("*")].some((item) => {
      const bounds = item.getBoundingClientRect();
      return (
        bounds.width === 32 &&
        bounds.height === 32 &&
        bounds.left <= x &&
        x <= bounds.right &&
        bounds.top <= y &&
        y <= bounds.bottom &&
        getComputedStyle(item).visibility === "visible"
      );
    });
  });
  expect(iconContainsNumber).toBe(true);
}

test("12. на 390 px число в иконке меняется, кнопка остаётся в ряду с заголовком и сессией", async ({
  page,
}) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/");

  const today = localDate();
  const trigger = pickDay(page, today);
  const chronology = timeline(page);
  const title = heading(chronology, "Хронология");
  const session = button(chronology, "Сессия");
  const row = await Promise.all([title, trigger, session].map(boxOf));
  const rowTop = Math.max(...row.map(({ y }) => y));
  const rowBottom = Math.min(...row.map(({ y, height }) => y + height));
  expect(rowTop).toBeLessThan(rowBottom);
  row.sort((first, second) => first.x - second.x);
  for (const [index, item] of row.entries()) {
    const next = row[index + 1];
    if (next) expect(item.x + item.width).toBeLessThanOrEqual(next.x);
  }
  expect(await boxOf(trigger)).toMatchObject({ width: 44, height: 44 });
  await expectMobileDayIcon(trigger, today);

  await trigger.click();
  const calendar = region(page, "Календарь");
  const yesterday = localDate(1);
  if (yesterday.getUTCMonth() !== today.getUTCMonth()) {
    await button(calendar, PREVIOUS_MONTH).click();
  }
  await calendarDay(calendar, yesterday).click();

  await expectMobileDayIcon(pickDay(page, yesterday), yesterday);
});

test("12. с ширины 768 px кнопка календаря показывает полную дату и стрелку", async ({ page }) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/");

  const today = localDate();
  const trigger = pickDay(page, today);
  await expect(trigger).toHaveText(DATE_FORMAT.format(today), { useInnerText: true });
  await expect(trigger.locator("svg:visible")).toBeVisible();
});

for (const { viewport, size } of [
  { viewport: PHONE_VIEWPORT, size: 44 },
  { viewport: DESKTOP_VIEWPORT, size: 32 },
]) {
  test(`13. на ширине ${viewport.width} px обе стрелки месяца имеют размер ${size} на ${size} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const calendar = await openCalendar(page);

    for (const name of [PREVIOUS_MONTH, NEXT_MONTH]) {
      expect(await boxOf(button(calendar, name))).toMatchObject({ width: size, height: size });
    }
  });
}
