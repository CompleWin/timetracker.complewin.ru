import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addLocalSession,
  dayMonthRu,
  localIso,
  loginInZone,
  shortDateRu,
  weekdayShortRu,
} from "./helpers/afternoon.ts";
import { createProject, createTask } from "./helpers/api.ts";
import { expectNoHorizontalScroll, PHONE_VIEWPORT } from "./helpers/layout.ts";
import { boxOf } from "./helpers/picker-size.ts";
import {
  fillGapButton,
  hourMarkTexts,
  nextApiRead,
  returnToTab,
  sessionBlock,
  timeScale,
  timeline,
  waitPastFullHour,
  zoneAtHour,
} from "./helpers/timeline.ts";
import { button, dialog, field, group, island, textOf } from "./helpers/ui.ts";

const ZONE = zoneAtHour(13);
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const PREVIOUS_WEEK = "Предыдущая неделя";
const NEXT_WEEK = "Следующая неделя";
const TODAY_FROM_MONDAY = WEEKDAYS.indexOf(weekdayShortRu(ZONE));
const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: ZONE.timezoneId,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const UTC = { timezoneId: "Etc/UTC", offsetHours: 0 };
const REFRESH_INTERVAL_MS = 20_000;

function week(page: Page): Locator {
  return group(timeline(page), "Неделя");
}

function dayName(daysAgo: number): string {
  return DATE_FORMAT.format(new Date(localIso(ZONE, "12:00", daysAgo)));
}

function dayButton(page: Page, daysAgo: number): Locator {
  return button(week(page), dayName(daysAgo));
}

function yesterdayInput(time: string): string {
  return localIso(ZONE, time, 1).slice(0, 16);
}

function timelineDate(page: Page, date: string): Locator {
  return textOf(timeline(page), date);
}

async function expectWeek(page: Page, mondayDaysAgo: number): Promise<void> {
  const buttons = week(page).getByRole("button");
  await expect(buttons).toHaveCount(9);
  await expect(buttons.first()).toHaveAccessibleName(PREVIOUS_WEEK);
  for (const [index, weekday] of WEEKDAYS.entries()) {
    const daysAgo = mondayDaysAgo - index;
    const day = buttons.nth(index + 1);
    const dayNumber = String(Number(localIso(ZONE, "12:00", daysAgo).slice(8, 10)));
    await expect(day).toHaveAccessibleName(dayName(daysAgo));
    await expect(textOf(day, dayNumber)).toBeVisible();
    await expect(textOf(day, weekday)).toBeVisible();
  }
  await expect(buttons.last()).toHaveAccessibleName(NEXT_WEEK);
}

async function selectYesterday(page: Page): Promise<void> {
  if (TODAY_FROM_MONDAY === 0) await button(week(page), PREVIOUS_WEEK).click();
  await dayButton(page, 1).click();
  await expect(timelineDate(page, dayName(1))).toBeVisible();
}

async function expectScaleLimits(page: Page, first: string, last: string): Promise<void> {
  await expect
    .poll(async () => {
      const marks = await hourMarkTexts(page);
      return [marks.at(0), marks.at(-1)];
    })
    .toEqual([first, last]);
}

async function openHomeAt(page: Page, time: Date): Promise<void> {
  await loginInZone(page, UTC);
  await page.clock.install({ time: time.getTime() - 60_000 });
  await page.clock.pauseAt(time);
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch();
    const serverNow = await page.evaluate(() => new Date().toISOString());
    await route.fulfill({
      response,
      headers: { ...response.headers(), "x-server-now": serverNow },
    });
  });
  await page.goto("/");
}

test.describe("Прошлые дни", () => {
  test.use({ timezoneId: ZONE.timezoneId });

  test.beforeEach(async ({ page }) => {
    await loginInZone(page, ZONE);
  });

  test("1–2. полоса показывает дни по порядку и отмечает сегодняшний", async ({ page }) => {
    await page.goto("/");

    await expect(week(page)).toBeVisible();
    await expectWeek(page, TODAY_FROM_MONDAY);
    await expect(button(week(page), PREVIOUS_WEEK)).toHaveAttribute("title", PREVIOUS_WEEK);
    await expect(button(week(page), NEXT_WEEK)).toHaveAttribute("title", NEXT_WEEK);
    await expect(button(week(page), NEXT_WEEK)).toBeDisabled();

    for (let index = 0; index < WEEKDAYS.length; index++) {
      const daysAgo = TODAY_FROM_MONDAY - index;
      const day = dayButton(page, daysAgo);
      await expect(day).toHaveAttribute("aria-pressed", String(daysAgo === 0));
    }
    await expect(dayButton(page, 0)).toHaveAttribute("aria-current", "date");
  });

  test("4–5. вчера и сегодня показывают свои даты и сессии", async ({ page }) => {
    const anki = await createTask(page, { title: "Anki" });
    const run = await createTask(page, { title: "Бег" });
    await addLocalSession(page, ZONE, anki.id, { start: "16:00", end: "16:30", daysAgo: 1 });
    await addLocalSession(page, ZONE, run.id, { start: "10:00", end: "10:30" });
    await page.goto("/");

    const ankiBlock = sessionBlock(page, "Anki", "16:00–16:30");
    const runBlock = sessionBlock(page, "Бег", "10:00–10:30");
    await selectYesterday(page);
    await expect(ankiBlock).toBeVisible();
    await expect(runBlock).toHaveCount(0);
    await expect(dayButton(page, 1)).toHaveAttribute("aria-pressed", "true");

    if (TODAY_FROM_MONDAY === 0) await button(week(page), NEXT_WEEK).click();
    await dayButton(page, 0).click();

    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(runBlock).toBeVisible();
    await expect(ankiBlock).toHaveCount(0);
  });

  test("6–7. стрелки меняют выбранный день на семь дней", async ({ page }) => {
    await page.goto("/");
    const nextWeek = button(week(page), NEXT_WEEK);

    await button(week(page), PREVIOUS_WEEK).click();

    await expect(timelineDate(page, dayName(7))).toBeVisible();
    await expectWeek(page, TODAY_FROM_MONDAY + 7);
    await expect(nextWeek).toBeEnabled();

    await nextWeek.click();

    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(nextWeek).toBeDisabled();
  });

  test("9. во вчерашней хронологии нет линии текущего времени", async ({ page }) => {
    await waitPastFullHour();
    await page.goto("/");
    const currentTime = timeScale(page).getByText(/^\d{2}:(?!00)\d{2}$/);
    await expect(currentTime).toBeVisible();

    await selectYesterday(page);

    await expect(currentTime).toHaveCount(0);
  });

  test("10. ранняя сессия даёт шкалу от 06:00 до 18:00", async ({ page }) => {
    const task = await createTask(page, { title: "Раннее чтение" });
    await addLocalSession(page, ZONE, task.id, { start: "06:20", end: "07:10", daysAgo: 1 });
    await page.goto("/");

    await selectYesterday(page);

    await expectScaleLimits(page, "06:00", "18:00");
  });

  test("11. сессия до 22:40 даёт последнюю отметку 23:00", async ({ page }) => {
    const task = await createTask(page, { title: "Вечернее чтение" });
    await addLocalSession(page, ZONE, task.id, { start: "21:00", end: "22:40", daysAgo: 1 });
    await page.goto("/");

    await selectYesterday(page);

    await expect.poll(async () => (await hourMarkTexts(page)).at(-1)).toBe("23:00");
  });

  test("12. вчера без сессий шкала от 08:00 до 18:00", async ({ page }) => {
    await page.goto("/");

    await selectYesterday(page);

    await expectScaleLimits(page, "08:00", "18:00");
  });

  test("13. между вчерашними сессиями виден пропуск и его можно заполнить", async ({ page }) => {
    const task = await createTask(page, { title: "Anki" });
    await addLocalSession(page, ZONE, task.id, { start: "10:00", end: "10:30", daysAgo: 1 });
    await addLocalSession(page, ZONE, task.id, { start: "11:15", end: "11:45", daysAgo: 1 });
    await page.goto("/");
    await selectYesterday(page);

    await expect(textOf(timeline(page), "Пропуск 45 мин")).toBeVisible();
    const fillGap = fillGapButton(page, "10:30–11:15");
    await expect(fillGap).toBeVisible();
    await fillGap.click();

    const form = dialog(page, "Новая сессия");
    await expect(field(form, "Начало")).toHaveValue(yesterdayInput("10:30"));
    await expect(field(form, "Конец")).toHaveValue(yesterdayInput("11:15"));
    await button(form, "Сохранить").click();

    await expect(form).toBeHidden();
    await expect(fillGap).toHaveCount(0);
    await expect(sessionBlock(page, "Anki", "10:00–11:45")).toBeVisible();
    await expect(dayButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  });

  test("14. правка вчерашней сессии сохраняет выбранный день", async ({ page }) => {
    const task = await createTask(page, { title: "Anki" });
    await addLocalSession(page, ZONE, task.id, { start: "10:00", end: "10:30", daysAgo: 1 });
    await page.goto("/");
    await selectYesterday(page);

    await sessionBlock(page, "Anki", "10:00–10:30").click();
    const form = dialog(page, "Сессия");
    await expect(form).toBeVisible();
    await field(form, "Конец").fill(yesterdayInput("10:20"));
    await button(form, "Сохранить").click();

    await expect(form).toBeHidden();
    await expect(sessionBlock(page, "Anki", "10:00–10:20")).toBeVisible();
    await expect(timelineDate(page, dayName(1))).toBeVisible();
    await expect(dayButton(page, 1)).toHaveAttribute("aria-pressed", "true");
  });

  test("15–16. итог, сессии и столбики сводки обновляются на вчерашний день", async ({ page }) => {
    const languages = await createProject(page, { name: "Языки" });
    const sport = await createProject(page, { name: "Спорт" });
    const anki = await createTask(page, { title: "Anki", projectId: languages.id });
    const run = await createTask(page, { title: "Бег", projectId: sport.id });
    await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "11:00", daysAgo: 1 });
    await addLocalSession(page, ZONE, run.id, { start: "10:40", end: "11:10", daysAgo: 1 });
    await addLocalSession(page, ZONE, run.id, { start: "10:00", end: "10:20" });
    await page.goto("/");

    await expect(island(page, "Сводка за сегодня")).toBeVisible();
    await selectYesterday(page);

    const summary = island(page, `Сводка за ${dayMonthRu(ZONE, 1)}`);
    await expect(summary).toBeVisible();
    await expect(textOf(summary, "1 ч 30 мин")).toBeVisible();
    await expect(textOf(summary, "2 сессии · параллельно 20 мин")).toBeVisible();
    await expect(summary.getByText(/^(Языки|Спорт|1 ч|30 мин)$/)).toHaveText([
      "Языки",
      "1 ч",
      "Спорт",
      "30 мин",
    ]);
    const bars = summary.getByTitle(/^\d{2}\.\d{2}: /);
    await expect(bars).toHaveCount(7);
    await expect(bars.last()).toHaveAttribute("title", `${shortDateRu(ZONE, 1)}: 1 ч 30 мин`);
  });

  test("17. после перезагрузки снова выбран сегодняшний день", async ({ page }) => {
    await page.goto("/");
    const previousWeek = button(week(page), PREVIOUS_WEEK);
    await previousWeek.click();
    await previousWeek.click();
    await expect(timelineDate(page, dayName(14))).toBeVisible();

    await page.reload();

    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(dayButton(page, 0)).toHaveAttribute("aria-pressed", "true");
  });

  test("19. на ширине 390 px девять кнопок в одной строке без прокрутки", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");

    const strip = week(page);
    const buttons = strip.getByRole("button");
    await expect(buttons).toHaveCount(9);
    await strip.scrollIntoViewIfNeeded();
    const boxes = await Promise.all((await buttons.all()).map((item) => boxOf(item)));
    const rowTop = Math.max(...boxes.map(({ y }) => y));
    const rowBottom = Math.min(...boxes.map(({ y, height }) => y + height));
    expect(rowTop).toBeLessThan(rowBottom);
    for (const item of await buttons.all()) await expect(item).toBeInViewport({ ratio: 1 });
    await expect.poll(() => strip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    await expectNoHorizontalScroll(page);
  });
});

test.describe("Полоса недели в начале недели и в полночь", () => {
  test.use({ timezoneId: UTC.timezoneId, serviceWorkers: "block" });

  test("3 и 8. будущие дни выключены, переход с прошлого воскресенья выбирает сегодня", async ({
    page,
  }) => {
    await openHomeAt(page, new Date("2026-11-16T13:00:00.000Z"));
    const strip = week(page);
    const monday = "понедельник, 16 ноября";
    await expect(button(strip, monday)).toBeEnabled();
    const futureDays = [
      "вторник, 17 ноября",
      "среда, 18 ноября",
      "четверг, 19 ноября",
      "пятница, 20 ноября",
      "суббота, 21 ноября",
      "воскресенье, 22 ноября",
    ];
    for (const date of futureDays) await expect(button(strip, date)).toBeDisabled();

    await button(strip, PREVIOUS_WEEK).click();
    const sunday = button(strip, "воскресенье, 15 ноября");
    await sunday.click();
    await expect(sunday).toHaveAttribute("aria-pressed", "true");

    await button(strip, NEXT_WEEK).click();

    await expect(timelineDate(page, monday)).toBeVisible();
    await expect(button(strip, monday)).toHaveAttribute("aria-pressed", "true");
    await expect(button(strip, NEXT_WEEK)).toBeDisabled();
  });

  test("18. автообновление после полуночи выбирает новый день и его неделю", async ({ page }) => {
    await openHomeAt(page, new Date("2026-11-15T23:59:50.000Z"));
    const sunday = "воскресенье, 15 ноября";
    const monday = "понедельник, 16 ноября";
    await expect(timelineDate(page, sunday)).toBeVisible();
    await expect(button(week(page), sunday)).toHaveAttribute("aria-pressed", "true");

    const refresh = nextApiRead(page, 10_000);
    await page.clock.runFor(REFRESH_INTERVAL_MS + 1_000);
    await refresh;

    await expect(timelineDate(page, monday)).toBeVisible();
    await expect(button(week(page), monday)).toHaveAttribute("aria-pressed", "true");
    await expect(button(week(page), monday)).toHaveAttribute("aria-current", "date");
    await expect(button(week(page), sunday)).toHaveCount(0);
  });

  test("18. автообновление и возврат фокуса сохраняют выбранный прошлый день", async ({ page }) => {
    await openHomeAt(page, new Date("2026-11-15T23:59:50.000Z"));
    const past = "суббота, 14 ноября";
    const pastDay = button(week(page), past);
    const sunday = button(week(page), "воскресенье, 15 ноября");
    await expect(sunday).toHaveAttribute("aria-current", "date");
    await pastDay.click();
    await expect(timelineDate(page, past)).toBeVisible();

    const refresh = nextApiRead(page, 10_000);
    await page.clock.runFor(REFRESH_INTERVAL_MS + 1_000);
    await refresh;
    await expect(sunday).not.toHaveAttribute("aria-current", "date");
    await expect(timelineDate(page, past)).toBeVisible();

    const focusRefresh = nextApiRead(page, 10_000);
    await returnToTab(page);
    await focusRefresh;
    await expect(timelineDate(page, past)).toBeVisible();
    await expect(pastDay).toHaveAttribute("aria-pressed", "true");
  });
});
