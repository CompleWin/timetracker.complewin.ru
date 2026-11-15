import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { createTask, setTimeZone } from "./helpers/api.ts";
import { addLocalSession, type AfternoonZone } from "./helpers/afternoon.ts";
import { loginAs, type DevUser, type LoginOptions } from "./helpers/auth.ts";
import { boxOf, expectPx } from "./helpers/picker-size.ts";
import {
  DAY_MARKS,
  afterNextFrames,
  dashedFrameTop,
  expectFirstMarkShownInScale,
  expectLastMarkShownInScale,
  expectNowLineShownInScale,
  expectShownInScale,
  fillGapButton,
  hourMarkTexts,
  middleOf,
  nextApiRead,
  nowLine,
  returnToTab,
  scaleScrollTop,
  scrollScaleToStart,
  sessionBlock,
  spanOf,
  timeScale,
  timeline,
  waitForOpeningScroll,
  waitPastFullHour,
  zoneAtHour,
} from "./helpers/timeline.ts";
import { focusWithKeyboard, textOf } from "./helpers/ui.ts";

type UserHome = { page: Page; zone: AfternoonZone; user: DevUser };

type LocalSession = { title: string; start: string; end: string };

type HomeOptions = { login?: LoginOptions; sessions?: LocalSession[] };

type OpenHome = (hour: number, options?: HomeOptions) => Promise<UserHome>;

const AFTERNOON_HOUR = 13;
const SCALE_WINDOW_PX = 640;
const NOW_LINE_SHARE = 2 / 3;
const NOW_LINE_TOLERANCE_PX = 2;
const SUBPIXEL_PX = 0.5;
const AUTO_REFRESH_WAIT_MS = 25_000;
const FOCUS_REFRESH_WAIT_MS = 3_000;

const test = base.extend<{ openHome: OpenHome }>({
  openHome: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (hour, { login = {}, sessions = [] } = {}) => {
      await waitPastFullHour();
      const zone = zoneAtHour(hour);
      const context = await browser.newContext({ timezoneId: zone.timezoneId });
      contexts.push(context);
      const page = await context.newPage();
      const user = await loginAs(page, login);
      await setTimeZone(page, zone.timezoneId);
      await addSessions(page, zone, sessions);
      await page.goto("/");
      return { page, zone, user };
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

async function addSessions(
  page: Page,
  zone: AfternoonZone,
  sessions: LocalSession[],
): Promise<void> {
  for (const { title, start, end } of sessions) {
    const task = await createTask(page, { title });
    await addLocalSession(page, zone, task.id, { start, end });
  }
}

async function islandHeight(page: Page): Promise<number> {
  return (await boxOf(timeline(page))).height;
}

async function scaleWindowHeight(page: Page): Promise<number> {
  return (await boxOf(timeScale(page))).height;
}

async function expectScaleWindowHeight(page: Page): Promise<void> {
  await expectPx(() => scaleWindowHeight(page), SCALE_WINDOW_PX);
}

async function expectScrollKept(page: Page, scrollTop: number): Promise<void> {
  await afterNextFrames(page);
  expect(await scaleScrollTop(page)).toBe(scrollTop);
  await expectFirstMarkShownInScale(page);
}

for (const hour of ["02", "22"]) {
  test(`1. в ${hour}:xx без сессий на шкале 25 отметок от "00:00" до "23:00" и последняя "00:00", отметки "24:00" нет`, async ({
    openHome,
  }) => {
    const { page } = await openHome(Number(hour));

    await expect.poll(() => hourMarkTexts(page)).toEqual(DAY_MARKS);
    await expect(textOf(timeline(page), "24:00")).toHaveCount(0);
  });
}

test('2. островок "Хронология" одной высоты без сессий в 02:xx и 22:xx и с тремя сессиями в 13:xx, область "Шкала времени" высотой 640 px', async ({
  openHome,
}) => {
  const early = await openHome(2);
  await expectScaleWindowHeight(early.page);
  const height = await islandHeight(early.page);

  const late = await openHome(22, { login: early.user });
  await expectScaleWindowHeight(late.page);
  await expectPx(() => islandHeight(late.page), height);

  const busy = await openHome(AFTERNOON_HOUR, {
    sessions: [
      { title: "Чтение", start: "09:00", end: "10:00" },
      { title: "Лаба", start: "10:30", end: "11:00" },
      { title: "Бег", start: "11:30", end: "12:00" },
    ],
  });
  await expect(sessionBlock(busy.page, "Бег", "11:30–12:00")).toBeVisible();
  await expectScaleWindowHeight(busy.page);
  await expectPx(() => islandHeight(busy.page), height);
});

test('3. в 13:xx при открытии линия "сейчас" видна в области "Шкала времени" на двух третях её высоты от верха', async ({
  openHome,
}) => {
  const { page, zone } = await openHome(AFTERNOON_HOUR);

  await expect(async () => {
    const scale = await spanOf(timeScale(page));
    const line = await spanOf(nowLine(page, zone));
    await expectShownInScale(page, line);
    const expectedOffset = (scale.bottom - scale.top) * NOW_LINE_SHARE;
    expect(Math.abs(middleOf(line) - scale.top - expectedOffset)).toBeLessThanOrEqual(
      NOW_LINE_TOLERANCE_PX,
    );
  }).toPass();
});

test('4. в 00:xx при открытии первая отметка "00:00" и линия "сейчас" видны в области "Шкала времени"', async ({
  openHome,
}) => {
  const { page, zone } = await openHome(0);

  await expectFirstMarkShownInScale(page);
  await expectNowLineShownInScale(page, zone);
});

test('5. в 23:xx при открытии последняя отметка "00:00" и линия "сейчас" видны в области "Шкала времени"', async ({
  openHome,
}) => {
  const { page, zone } = await openHome(23);

  await expectLastMarkShownInScale(page);
  await expectNowLineShownInScale(page, zone);
});

test('6. в 13:xx после прокрутки "Шкала времени" к началу видна первая отметка "00:00", автообновление и возврат фокуса на вкладку прокрутку не сдвигают', async ({
  openHome,
}) => {
  test.slow();
  const { page } = await openHome(AFTERNOON_HOUR);
  await waitForOpeningScroll(page);

  await scrollScaleToStart(page);
  await expectFirstMarkShownInScale(page);
  const scrollTop = await scaleScrollTop(page);

  await nextApiRead(page, AUTO_REFRESH_WAIT_MS);
  await expectScrollKept(page, scrollTop);

  const focusRefresh = nextApiRead(page, FOCUS_REFRESH_WAIT_MS);
  await returnToTab(page);
  await focusRefresh;
  await expectScrollKept(page, scrollTop);
});

test('7. в 13:xx фокус с клавиатуры на "Шкала времени" и PageDown прокручивают её вниз', async ({
  openHome,
}) => {
  const { page } = await openHome(AFTERNOON_HOUR);
  await waitForOpeningScroll(page);
  await focusWithKeyboard(page, timeScale(page));
  const scrollTop = await scaleScrollTop(page);

  await page.keyboard.press("PageDown");

  await expect.poll(() => scaleScrollTop(page)).toBeGreaterThan(scrollTop);
});

test('8. "Чтение" 08:58–09:03 и "Лаба" 09:30–10:30: блоки обеих сессий видны, пропуска 09:03–09:30 нет', async ({
  openHome,
}) => {
  const { page } = await openHome(AFTERNOON_HOUR, {
    sessions: [
      { title: "Чтение", start: "08:58", end: "09:03" },
      { title: "Лаба", start: "09:30", end: "10:30" },
    ],
  });

  await expect(sessionBlock(page, "Чтение", "08:58–09:03")).toBeVisible();
  await expect(sessionBlock(page, "Лаба", "09:30–10:30")).toBeVisible();
  await expect(fillGapButton(page, "09:03–09:30")).toHaveCount(0);
  await expect(textOf(page, "Пропуск 27 мин")).toHaveCount(0);
});

test('9. "Чтение" 08:58–09:03 и "Лаба" 10:00–11:00: "Пропуск 57 мин" и "Заполнить пропуск 09:03–10:00" видны, верх пунктирного блока не выше низа блока "Чтение"', async ({
  openHome,
}) => {
  const { page } = await openHome(AFTERNOON_HOUR, {
    sessions: [
      { title: "Чтение", start: "08:58", end: "09:03" },
      { title: "Лаба", start: "10:00", end: "11:00" },
    ],
  });

  const fillGap = fillGapButton(page, "09:03–10:00");
  await expect(fillGap).toBeVisible();
  await expect(textOf(timeline(page), "Пропуск 57 мин")).toBeVisible();
  const reading = await spanOf(sessionBlock(page, "Чтение", "08:58–09:03"));
  expect(await dashedFrameTop(fillGap)).toBeGreaterThanOrEqual(reading.bottom - SUBPIXEL_PX);
});

test('10. сессии 10:00–10:30 и 11:15–11:45 дают "Пропуск 45 мин" и "Заполнить пропуск 10:30–11:15"', async ({
  openHome,
}) => {
  const { page } = await openHome(AFTERNOON_HOUR, {
    sessions: [
      { title: "Чтение", start: "10:00", end: "10:30" },
      { title: "Лаба", start: "11:15", end: "11:45" },
    ],
  });

  await expect(textOf(timeline(page), "Пропуск 45 мин")).toBeVisible();
  await expect(fillGapButton(page, "10:30–11:15")).toBeVisible();
});

test('11. сессии 10:00–10:30 и 10:50–11:20 дают "Пропуск 20 мин" и "Заполнить пропуск 10:30–10:50"', async ({
  openHome,
}) => {
  const { page } = await openHome(AFTERNOON_HOUR, {
    sessions: [
      { title: "Чтение", start: "10:00", end: "10:30" },
      { title: "Лаба", start: "10:50", end: "11:20" },
    ],
  });

  await expect(textOf(timeline(page), "Пропуск 20 мин")).toBeVisible();
  await expect(fillGapButton(page, "10:30–10:50")).toBeVisible();
});
