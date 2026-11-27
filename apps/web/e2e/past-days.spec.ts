import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addLocalSession,
  dayMonthRu,
  localIso,
  loginInZone,
  shortDateRu,
  weekdayShortRu,
} from "./helpers/afternoon.ts";
import { addSession, createProject, createTask, setTimeZone, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { expectNoHorizontalScroll, PHONE_VIEWPORT } from "./helpers/layout.ts";
import { boxOf, expectPx } from "./helpers/picker-size.ts";
import { stopTimerButton } from "./helpers/picker.ts";
import {
  DAY_MARKS,
  expectFirstMarkShownInScale,
  expectLastMarkShownInScale,
  expectShownInScale,
  fillGapButton,
  hourMarkTexts,
  middleOf,
  nextApiRead,
  returnToTab,
  sessionBlock,
  spanOf,
  timeScale,
  timeline,
  zoneAtHour,
} from "./helpers/timeline.ts";
import {
  button,
  dialog,
  field,
  group,
  heading,
  island,
  region,
  runningNow,
  textOf,
} from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const ZONE = zoneAtHour(13);
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const PREVIOUS_WEEK = "Предыдущая неделя";
const NEXT_WEEK = "Следующая неделя";
const TODAY = "Сегодня";
const HOUR_PX = 64;
const SCALE_WINDOW_PX = 640;
const TODAY_FROM_MONDAY = WEEKDAYS.indexOf(weekdayShortRu(ZONE));
const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: ZONE.timezoneId,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const REFRESH_INTERVAL_MS = 20_000;

function week(page: Page): Locator {
  return group(page, "Неделя");
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
  await expect(button(timeline(page), `Выбрать день: ${dayName(1)}`)).toBeVisible();
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
  await loginAs(page);
  const timeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  await setTimeZone(page, timeZone);
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

  test("1 и 2. полоса над хронологией показывает дни по порядку и отмечает сегодняшний", async ({
    page,
  }) => {
    await page.goto("/");

    const strip = week(page);
    const chronology = timeline(page);
    const title = heading(chronology, "Хронология");
    await expect(strip).toBeVisible();
    await expect(title).toBeVisible();
    await expect(group(chronology, "Неделя")).toHaveCount(0);
    const stripBox = await boxOf(strip);
    expect(stripBox.y + stripBox.height).toBeLessThanOrEqual((await boxOf(title)).y);

    await expectWeek(page, TODAY_FROM_MONDAY);
    await expect(button(strip, PREVIOUS_WEEK)).toHaveAttribute("title", PREVIOUS_WEEK);
    await expect(button(strip, NEXT_WEEK)).toHaveAttribute("title", NEXT_WEEK);
    await expect(button(strip, NEXT_WEEK)).toBeDisabled();

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

  test("6–7. стрелки листают недели и сохраняют выбранную дату, хронологию и сводку", async ({
    page,
  }) => {
    const task = await createTask(page, { title: "Чтение" });
    await addLocalSession(page, ZONE, task.id, { start: "10:00", end: "10:20" });
    await addLocalSession(page, ZONE, task.id, { start: "11:00", end: "12:00", daysAgo: 7 });
    await page.goto("/");
    const nextWeek = button(week(page), NEXT_WEEK);
    const todaySummary = island(page, "Сводка за сегодня");
    const todayBlock = sessionBlock(page, task.title, "10:00–10:20");
    const pastBlock = sessionBlock(page, task.title, "11:00–12:00");
    await expect(todayBlock).toBeVisible();

    await button(week(page), PREVIOUS_WEEK).click();

    await expectWeek(page, TODAY_FROM_MONDAY + 7);
    await expect(nextWeek).toBeEnabled();
    await expect(week(page).getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(todayBlock).toBeVisible();
    await expect(pastBlock).toHaveCount(0);
    await expect(
      todaySummary.getByTitle(`${shortDateRu(ZONE)}: 20 мин`, { exact: true }),
    ).toBeVisible();

    await nextWeek.click();

    await expectWeek(page, TODAY_FROM_MONDAY);
    await expect(dayButton(page, 0)).toHaveAttribute("aria-pressed", "true");
    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(todayBlock).toBeVisible();
    await expect(todaySummary).toBeVisible();
    await expect(nextWeek).toBeDisabled();
  });

  test("15–16. незагруженный день без сети показывает ошибку и обновляется после подключения", async ({
    page,
    context,
  }) => {
    const task = await createTask(page, { title: "Прошлое чтение" });
    await addLocalSession(page, ZONE, task.id, { start: "10:00", end: "11:00", daysAgo: 7 });
    await page.goto("/");
    await expect(island(page, "Сводка за сегодня")).toBeVisible();

    await context.setOffline(true);
    const unavailable = page
      .getByRole("alert")
      .filter({ hasText: "Не удалось загрузить данные за выбранный день." });
    await button(week(page), PREVIOUS_WEEK).click();
    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(island(page, "Сводка за сегодня")).toBeVisible();
    await expect(unavailable).toBeHidden();

    await dayButton(page, 7).click();

    const summary = island(page, `Сводка за ${dayMonthRu(ZONE, 7)}`);
    await expect(dayButton(page, 7)).toHaveAttribute("aria-pressed", "true");
    await expect(unavailable).toBeVisible();
    await expect(textOf(summary, "0 сессий")).toHaveCount(0);

    await context.setOffline(false);

    await expect(unavailable).toBeHidden();
    await expect(timelineDate(page, dayName(7))).toBeVisible();
    await expect(sessionBlock(page, task.title, "10:00–11:00")).toBeVisible();
    await expect(textOf(summary, "1 сессия")).toBeVisible();
    await expect(textOf(summary, "1 ч").first()).toBeVisible();
  });

  test("1. вчерашние вечерние сессии открываются на своих местах, обе полуночи доступны", async ({
    page,
  }) => {
    const reading = await createTask(page, { title: "Чтение" });
    const writing = await createTask(page, { title: "Заметки" });
    await addLocalSession(page, ZONE, reading.id, { start: "20:45", end: "20:55", daysAgo: 1 });
    await addLocalSession(page, ZONE, writing.id, { start: "22:45", end: "22:55", daysAgo: 1 });
    await page.goto("/");

    await selectYesterday(page);

    const scale = timeScale(page);
    const first = sessionBlock(page, reading.title, "20:45\u201320:55");
    const second = sessionBlock(page, writing.title, "22:45\u201322:55");
    const gap = fillGapButton(page, "20:55\u201322:45");
    await expect(async () => {
      await expectShownInScale(page, await spanOf(first));
    }).toPass();
    await expect.poll(() => hourMarkTexts(page)).toEqual(DAY_MARKS);
    await expectPx(async () => (await boxOf(second)).y - (await boxOf(first)).y, 2 * HOUR_PX);
    for (const [card, hour] of [
      [first, 20],
      [second, 22],
    ] as const) {
      const start = (await spanOf(card)).top;
      expect(start).toBeGreaterThan(middleOf(await spanOf(textOf(scale, `${hour}:00`))));
      expect(start).toBeLessThan(middleOf(await spanOf(textOf(scale, `${hour + 1}:00`))));
    }
    await expect(scale.getByRole("button", { name: /^Заполнить пропуск / })).toHaveCount(1);

    await scale.press("Home");
    await expectFirstMarkShownInScale(page);
    await scale.press("End");
    await expectLastMarkShownInScale(page);
    await expectShownInScale(page, await spanOf(second));
    await expectShownInScale(page, await spanOf(gap));
  });

  test("2. вчера без сессий и после добавления сессии 06:15\u201306:30 шкала охватывает сутки", async ({
    page,
  }) => {
    await page.goto("/");
    await selectYesterday(page);
    await expect.poll(() => hourMarkTexts(page)).toEqual(DAY_MARKS);

    const task = await createTask(page, { title: "Раннее чтение" });
    await addLocalSession(page, ZONE, task.id, { start: "06:15", end: "06:30", daysAgo: 1 });
    await page.reload();
    await selectYesterday(page);

    await expect(sessionBlock(page, task.title, "06:15\u201306:30")).toBeVisible();
    await expect.poll(() => hourMarkTexts(page)).toEqual(DAY_MARKS);
  });

  for (const viewport of [{ width: 1280, height: 900 }, PHONE_VIEWPORT]) {
    test(`4. на ширине ${viewport.width} px полные сутки прокручиваются в окне 640 px под шапкой`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await selectYesterday(page);

      const chronology = timeline(page);
      const scale = timeScale(page);
      const header = [
        heading(chronology, "Хронология"),
        button(chronology, `Выбрать день: ${dayName(1)}`),
        button(chronology, "Сессия"),
      ];
      await expectPx(async () => (await boxOf(scale)).height, SCALE_WINDOW_PX);
      await expectPx(async () => {
        const first = await boxOf(textOf(scale, "01:00"));
        const second = await boxOf(textOf(scale, "02:00"));
        return second.y - first.y;
      }, HOUR_PX);

      await scale.press("End");
      await expectLastMarkShownInScale(page);
      await scale.press("Home");
      await expectFirstMarkShownInScale(page);

      const scaleTop = (await spanOf(scale)).top;
      for (const item of header) expect((await spanOf(item)).bottom).toBeLessThanOrEqual(scaleTop);
    });
  }

  test("13. вчерашний пропуск с секундами в границах заполняется без правки времени", async ({
    page,
  }) => {
    const task = await createTask(page, { title: "Anki" });
    const startedAt = new Date(Date.parse(localIso(ZONE, "10:30", 1)) + 45_000).toISOString();
    const endedAt = new Date(Date.parse(localIso(ZONE, "11:15", 1)) + 45_000).toISOString();
    await addSession(page, task.id, { startedAt: localIso(ZONE, "10:00", 1), endedAt: startedAt });
    await addSession(page, task.id, { startedAt: endedAt, endedAt: localIso(ZONE, "11:45", 1) });
    await page.goto("/");
    await selectYesterday(page);

    await expect(textOf(timeline(page), "Пропуск 45 мин")).toBeVisible();
    const fillGap = fillGapButton(page, "10:30–11:15");
    await expect(fillGap).toBeVisible();
    await fillGap.click();

    const form = dialog(page, "Новая сессия");
    await expect(field(form, "Начало")).toHaveValue(yesterdayInput("10:30"));
    await expect(field(form, "Конец")).toHaveValue(yesterdayInput("11:15"));
    const save = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === `/api/tasks/${task.id}/sessions`,
    );
    await button(form, "Сохранить").click();

    expect((await save).postDataJSON()).toMatchObject({ startedAt, endedAt });
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
    await dayButton(page, 14).click();
    await expect(timelineDate(page, dayName(14))).toBeVisible();

    await page.reload();

    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(dayButton(page, 0)).toHaveAttribute("aria-pressed", "true");
  });

  test.describe("Ошибка загрузки истории", () => {
    test.use({ serviceWorkers: "block" });

    test("18. остановленный таймер исчезает при ошибке истории, прошлый день обновляется после восстановления", async ({
      page,
    }) => {
      const task = await createTask(page, { title: "Чтение" });
      await addLocalSession(page, ZONE, task.id, { start: "10:00", end: "10:20", daysAgo: 1 });
      await startTimer(page, task.id);
      const now = Date.now();
      await page.clock.install({ time: now - 60_000 });
      await page.clock.pauseAt(now);
      await page.goto("/");
      await selectYesterday(page);

      const stop = stopTimerButton(runningNow(page), task.title);
      const summary = island(page, `Сводка за ${dayMonthRu(ZONE, 1)}`);
      const newBlock = sessionBlock(page, task.title, "11:00–11:40");
      await expect(stop).toBeVisible();
      await expect(sessionBlock(page, task.title, "10:00–10:20")).toBeVisible();
      await expect(textOf(summary, "1 сессия")).toBeVisible();

      const stopped = await page.request.post(`/api/tasks/${task.id}/stop`);
      expect(stopped.status()).toBe(200);
      await addLocalSession(page, ZONE, task.id, { start: "11:00", end: "11:40", daysAgo: 1 });

      const pastPeriod = urlMatching("/api/sessions", {
        to: new Date(localIso(ZONE, "00:00")).toISOString(),
      });
      await page.route(pastPeriod, (route) =>
        route.fulfill({
          status: 503,
          headers: { "x-server-now": new Date().toISOString() },
          json: { error: { code: "internal_error", message: "Service unavailable" } },
        }),
      );
      const failedHistory = page.waitForResponse((response) => pastPeriod(new URL(response.url())));
      const activeTimers = page.waitForResponse("**/api/timers/active");

      await returnToTab(page);

      const [history, active] = await Promise.all([failedHistory, activeTimers]);
      expect(history.status()).toBe(503);
      expect(active.status()).toBe(200);
      expect(await active.json()).toMatchObject({ sessions: [] });
      await expect(stop).toHaveCount(0);
      await expect(newBlock).toHaveCount(0);

      await page.unroute(pastPeriod);
      await page.clock.runFor(REFRESH_INTERVAL_MS + 1_000);

      await expect(dayButton(page, 1)).toHaveAttribute("aria-pressed", "true");
      await expect(timelineDate(page, dayName(1))).toBeVisible();
      await expect(newBlock).toBeVisible();
      await expect(textOf(summary, "2 сессии")).toBeVisible();
      await expect(
        summary.getByTitle(`${shortDateRu(ZONE, 1)}: 1 ч`, { exact: true }),
      ).toBeVisible();
    });
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

  test("22. «Сегодня» возвращает текущую неделю, хронологию и сводку", async ({ page }) => {
    const todayTask = await createTask(page, { title: "Сегодняшнее чтение" });
    const pastTask = await createTask(page, { title: "Прошлое чтение" });
    await addLocalSession(page, ZONE, todayTask.id, { start: "10:00", end: "10:20" });
    await addLocalSession(page, ZONE, pastTask.id, {
      start: "10:00",
      end: "11:00",
      daysAgo: 14,
    });
    await page.goto("/");

    const strip = week(page);
    const previousWeek = button(strip, PREVIOUS_WEEK);
    const todayBlock = sessionBlock(page, todayTask.title, "10:00–10:20");
    const pastBlock = sessionBlock(page, pastTask.title, "10:00–11:00");
    await previousWeek.click();
    await previousWeek.click();
    await dayButton(page, 14).click();
    await expect(timelineDate(page, dayName(14))).toBeVisible();
    await expect(pastBlock).toBeVisible();
    await expect(todayBlock).toHaveCount(0);
    const pastSummary = island(page, `Сводка за ${dayMonthRu(ZONE, 14)}`);
    await expect(
      pastSummary.getByTitle(`${shortDateRu(ZONE, 14)}: 1 ч`, { exact: true }),
    ).toBeVisible();

    await button(page, TODAY).press("Enter");

    await expect(dayButton(page, 0)).toHaveAttribute("aria-pressed", "true");
    await expect(dayButton(page, 0)).toBeFocused();
    await expect(button(strip, NEXT_WEEK)).toBeDisabled();
    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(todayBlock).toBeVisible();
    await expect(pastBlock).toHaveCount(0);
    await expect(pastSummary).toHaveCount(0);
    const todaySummary = island(page, "Сводка за сегодня");
    await expect(
      todaySummary.getByTitle(`${shortDateRu(ZONE)}: 20 мин`, { exact: true }),
    ).toBeVisible();
  });

  test("22. «Сегодня» возвращает текущую неделю, когда сегодняшний день уже выбран", async ({
    page,
  }) => {
    await page.goto("/");

    const strip = week(page);
    const today = button(page, TODAY);
    await expect(today).toBeHidden();
    await button(strip, PREVIOUS_WEEK).click();
    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(dayButton(page, 0)).toHaveCount(0);
    await expect(today).toBeVisible();

    await today.press("Enter");

    await expect(dayButton(page, 0)).toHaveAttribute("aria-pressed", "true");
    await expect(dayButton(page, 0)).toBeFocused();
    await expect(button(strip, NEXT_WEEK)).toBeDisabled();
    await expect(timelineDate(page, dayName(0))).toBeVisible();
    await expect(today).toBeHidden();
  });
});

test.describe("Неделя и шкала при фиксированном времени", () => {
  test.use({ timezoneId: "Etc/UTC", serviceWorkers: "block" });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test.describe("Pacific/Apia", () => {
    test.use({ timezoneId: "Pacific/Apia" });

    test("1 и 6. в прошлой неделе пропущенная пятница недоступна, а субботу можно выбрать", async ({
      page,
    }) => {
      await openHomeAt(page, new Date("2012-01-05T22:00:00.000Z"));
      const strip = week(page);
      await button(strip, PREVIOUS_WEEK).click();

      const friday = button(strip, "пятница, 30 декабря");
      const saturday = button(strip, "суббота, 31 декабря");
      await expect(timelineDate(page, "пятница, 6 января")).toBeVisible();
      await expect(friday).toBeDisabled();
      await expect(friday).toHaveAttribute("aria-pressed", "false");
      await expect(saturday).toHaveAttribute("aria-pressed", "false");
      await saturday.click();

      await expect(saturday).toHaveAttribute("aria-pressed", "true");
      await expect(timelineDate(page, "суббота, 31 декабря")).toBeVisible();
    });
  });

  test.describe("America/Santiago", () => {
    test.use({ timezoneId: "America/Santiago" });

    test("9. в день без полуночи сегодняшняя шкала и линия сейчас показывают местное время", async ({
      page,
    }) => {
      await openHomeAt(page, new Date("2026-09-06T15:30:00.000Z"));

      await expectScaleLimits(page, "01:00", "00:00");
      const scale = timeScale(page);
      const noon = middleOf(await spanOf(textOf(scale, "12:00")));
      const one = middleOf(await spanOf(textOf(scale, "13:00")));
      const now = middleOf(await spanOf(textOf(scale, "12:30")));
      expect(Math.abs(now - (noon + one) / 2)).toBeLessThan(2);
    });
  });

  test.describe("Europe/Berlin", () => {
    test.use({ timezoneId: "Europe/Berlin" });

    test("3. в Берлине выбор 29 марта из недели показывает 23 часа без 02:00", async ({ page }) => {
      await openHomeAt(page, new Date("2026-03-30T22:30:00.000Z"));
      const strip = week(page);
      await button(strip, PREVIOUS_WEEK).click();
      const springDay = button(strip, "воскресенье, 29 марта");
      await springDay.click();

      await expect(springDay).toHaveAttribute("aria-pressed", "true");
      await expect
        .poll(() => hourMarkTexts(page))
        .toEqual(DAY_MARKS.filter((mark) => mark !== "02:00"));
    });

    test("3. в Берлине выбор 25 октября из календаря показывает 25 часов с двумя 02:00", async ({
      page,
    }) => {
      await openHomeAt(page, new Date("2026-11-01T23:30:00.000Z"));
      const chronology = timeline(page);
      await button(chronology, "Выбрать день: понедельник, 2 ноября").click();
      const calendar = region(page, "Календарь");
      await button(calendar, "Предыдущий месяц").click();
      await button(calendar, "воскресенье, 25 октября").click();

      await expect(button(chronology, "Выбрать день: воскресенье, 25 октября")).toBeVisible();
      await expect
        .poll(() => hourMarkTexts(page))
        .toEqual([...DAY_MARKS.slice(0, 3), "02:00", ...DAY_MARKS.slice(3)]);
    });
  });

  test("5. линия сейчас скрывается в прошлом и видна сразу при возврате на сегодня", async ({
    page,
  }) => {
    await openHomeAt(page, new Date("2026-11-14T13:30:00.000Z"));
    await page.clock.resume();
    const currentTime = textOf(timeScale(page), "13:30");
    await expect(currentTime).toBeVisible();

    await button(week(page), "пятница, 13 ноября").click();
    await expect(timelineDate(page, "пятница, 13 ноября")).toBeVisible();
    await expect(currentTime).toHaveCount(0);
    await timeScale(page).press("Home");
    await expectFirstMarkShownInScale(page);

    await button(page, TODAY).press("Enter");

    await expect(timelineDate(page, "суббота, 14 ноября")).toBeVisible();
    await expect.poll(() => hourMarkTexts(page)).toEqual(DAY_MARKS);
    await expect(async () => {
      await expectShownInScale(page, await spanOf(currentTime));
    }).toPass();
  });

  for (const { date, label } of [
    { date: "2026-11-21", label: "9–15 ноября" },
    { date: "2026-12-07", label: /^30 ноября\s*–\s*6 декабря$/ },
    {
      date: "2026-01-09",
      label: /^29\s+декабря\s+2025(?:\s+г\.)?\s*–\s*4\s+января\s+2026(?:\s+г\.)?$/,
    },
  ]) {
    test(`20. диапазон прошлой недели от ${date} виден слева над днями`, async ({ page }) => {
      await openHomeAt(page, new Date(`${date}T13:00:00.000Z`));
      const strip = week(page);

      await button(strip, PREVIOUS_WEEK).click();

      const range = page.getByText(label, { exact: true });
      const rangeBox = await boxOf(range);
      const stripBox = await boxOf(strip);
      expect(rangeBox.y + rangeBox.height).toBeLessThanOrEqual(stripBox.y);
      expect(rangeBox.x).toBeLessThan(stripBox.x + stripBox.width / 2);
    });
  }

  for (const viewport of [{ width: 1280, height: 900 }, PHONE_VIEWPORT]) {
    test(`21. «Сегодня» справа от диапазона, без сдвига дней на ширине ${viewport.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openHomeAt(page, new Date("2026-11-14T13:00:00.000Z"));

      const today = button(page, TODAY);
      const strip = week(page);
      const range = textOf(page, "9–15 ноября");
      await expect(today).toBeHidden();
      const initialGap = (await boxOf(strip)).y - (await boxOf(range)).y;

      await button(strip, "пятница, 13 ноября").click();

      const todayBox = await boxOf(today);
      const rangeBox = await boxOf(range);
      expect(todayBox.height).toBeGreaterThanOrEqual(44);
      expect(todayBox.x).toBeGreaterThanOrEqual(rangeBox.x + rangeBox.width);
      expect(todayBox.y).toBeLessThan(rangeBox.y + rangeBox.height);
      expect(todayBox.y + todayBox.height).toBeGreaterThan(rangeBox.y);
      expect((await boxOf(strip)).y - rangeBox.y).toBeCloseTo(initialGap);

      await today.click();

      await expect(button(strip, "суббота, 14 ноября")).toHaveAttribute("aria-pressed", "true");
      await expect(today).toBeHidden();
      expect((await boxOf(strip)).y - (await boxOf(range)).y).toBeCloseTo(initialGap);
    });
  }

  test("3 и 8. будущие дни выключены, переход на текущую неделю сохраняет прошлое воскресенье", async ({
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

    await expect(timelineDate(page, "воскресенье, 15 ноября")).toBeVisible();
    await expect(button(strip, monday)).toHaveAttribute("aria-pressed", "false");
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
