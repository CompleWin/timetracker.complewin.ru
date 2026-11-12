import { expect, test, type Locator, type Page } from "@playwright/test";
import { clockIn } from "./helpers/clock.ts";
import {
  chooseLanguage,
  demo,
  isOnScreen,
  scrollDemoIntoView,
  shownTexts,
  startDemoPlayback,
  timersBlock,
} from "./helpers/landing.ts";
import { textOf } from "./helpers/ui.ts";

const PLAYBACK_LIMIT_MS = 17_000;
const WATCH_MS = 20_000;
const STILL_FRAME_WAIT_MS = 3_000;

const RUNNING_ONE = "Сейчас идёт";
const RUNNING_TWO = "Сейчас идут · 2";

const DEMO_TIMELINE = "Хронология";
const DEMO_ONLY_TEXTS = ["Сводка за сегодня", "Андрей"];
const DEMO_TEXTS = [DEMO_TIMELINE, ...DEMO_ONLY_TEXTS];

function demoText(page: Page, text: string): Locator {
  return textOf(demo(page), text);
}

function demoScene(page: Page): Locator {
  return page
    .locator("*")
    .filter({ has: textOf(page, DEMO_TIMELINE) })
    .filter({ has: textOf(page, "Сводка за сегодня") })
    .filter({ has: textOf(page, "Андрей") })
    .last();
}

function insideAriaHidden(element: Locator): Locator {
  return element.locator('xpath=ancestor-or-self::*[@aria-hidden="true"]').first();
}

async function showsAll(...locators: Locator[]): Promise<boolean> {
  const shown = await Promise.all(locators.map(isOnScreen));
  return shown.every(Boolean);
}

async function showsNone(...locators: Locator[]): Promise<boolean> {
  const shown = await Promise.all(locators.map(isOnScreen));
  return !shown.some(Boolean);
}

async function expectDemoShows(page: Page, texts: string[]): Promise<void> {
  for (const text of texts) {
    await expect(shownTexts(demo(page), text).first()).toBeVisible();
  }
}

async function expectDemoHides(page: Page, texts: string[]): Promise<void> {
  for (const text of texts) {
    await expect(shownTexts(demo(page), text)).toHaveCount(0);
  }
}

function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

test("11. демо внутри aria-hidden: в дереве доступности демо нет «Хронология», «Сводка за сегодня» и «Андрей», а подпись «Хронология» у карточки остаётся", async ({
  page,
}) => {
  await page.goto("/");
  await scrollDemoIntoView(page);
  const scene = demoScene(page);
  for (const text of DEMO_TEXTS) {
    await expect(textOf(scene, text)).toBeVisible();
  }
  await expect(insideAriaHidden(scene)).toBeAttached();

  const sceneTree = await scene.ariaSnapshot();
  const pageTree = await page.locator("body").ariaSnapshot();
  const featuresTree = await page.locator("#features").ariaSnapshot();

  for (const text of DEMO_TEXTS) {
    expect(sceneTree).not.toContain(text);
  }
  for (const text of DEMO_ONLY_TEXTS) {
    expect(pageTree).not.toContain(text);
  }
  expect(featuresTree).toContain(DEMO_TIMELINE);
});

test("12. за 17 секунд демо запускает «Отчёт за месяц», пишет заметку, запускает вторую задачу и останавливает обе", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await scrollDemoIntoView(page);
  const playUntil = await startDemoPlayback(page, PLAYBACK_LIMIT_MS);
  const runningOneBlock = timersBlock(page, RUNNING_ONE);

  await playUntil("«Недавние» в панели выбора", () => showsAll(demoText(page, "Недавние")));
  await playUntil("«Отчёт за месяц» в строке идущего таймера", () =>
    showsAll(textOf(runningOneBlock, RUNNING_ONE), textOf(runningOneBlock, "Отчёт за месяц")),
  );
  await playUntil("заметку «таблица и выводы»", () => showsAll(demoText(page, "таблица и выводы")));
  await playUntil("«Сейчас идут · 2» и «Остановить все»", () =>
    showsAll(demoText(page, RUNNING_TWO), demoText(page, "Остановить все")),
  );
  await playUntil("островок без «Сейчас идёт»", () =>
    showsNone(demoText(page, RUNNING_ONE), demoText(page, RUNNING_TWO)),
  );
});

test("13. за 20 секунд на главной для гостя после загрузки нет ни одного запроса", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/", { waitUntil: "networkidle" });
  await scrollDemoIntoView(page);
  const requested = recordRequests(page);

  await page.clock.runFor(WATCH_MS);

  expect(requested).toEqual([]);
});

test.describe("prefers-reduced-motion: reduce", () => {
  test.use({ reducedMotion: "reduce" });

  test("14. демо стоит на кадре с двумя идущими таймерами без курсора, через 3 секунды тексты те же", async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto("/");
    await scrollDemoIntoView(page);
    await expectDemoShows(page, [
      RUNNING_TWO,
      "Отчёт за месяц",
      "таблица и выводы",
      "Созвон с командой",
    ]);
    await expect(demoText(page, "Андрей")).toBeHidden();
    await expect(clockIn(demo(page)).first()).toBeVisible();
    const textsAtStart = await demo(page).innerText();

    await page.clock.runFor(STILL_FRAME_WAIT_MS);

    expect(await demo(page).innerText()).toBe(textsAtStart);
  });

  test("15. после переключения на English демо показывает английские тексты, а русских названий в нём нет", async ({
    page,
  }) => {
    await page.goto("/");

    await chooseLanguage(page, "English");

    await scrollDemoIntoView(page);
    await expectDemoShows(page, [
      "Running now · 2",
      "Monthly report",
      "table and conclusions",
      "Team call",
    ]);
    await expectDemoHides(page, ["Отчёт за месяц", "Созвон с командой"]);
  });
});
