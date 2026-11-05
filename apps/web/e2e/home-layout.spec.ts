import { expect, test, type Page } from "@playwright/test";
import { openAccountMenu } from "./helpers/account-menu.ts";
import { createProject, createTask, startTimer } from "./helpers/api.ts";
import { addLocalSession, afternoonZone, loginInZone } from "./helpers/afternoon.ts";
import { PHONE_VIEWPORT, expectNoHorizontalScroll } from "./helpers/layout.ts";
import { openPicker } from "./helpers/picker.ts";
import { region, runningNow } from "./helpers/ui.ts";

type HomeState = {
  title: string;
  open: (page: Page) => Promise<void>;
};

const ZONE = afternoonZone();

const homeStates: HomeState[] = [
  { title: "без открытых панелей", open: () => Promise.resolve() },
  { title: "с открытой панелью выбора", open: (page) => openPicker(page) },
  { title: "с открытым меню", open: (page) => openAccountMenu(page) },
];

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

async function twoRunningTimersWithTodaySessions(page: Page): Promise<void> {
  const sport = await createProject(page, { name: "Спорт" });
  const languages = await createProject(page, { name: "Иностранные языки" });
  const treadmill = await createTask(page, { title: "Беговая дорожка", projectId: sport.id });
  const anki = await createTask(page, { title: "Карточки Anki", projectId: languages.id });
  await addLocalSession(page, ZONE, treadmill.id, { start: "10:00", end: "10:45" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:30", end: "11:15" });
  await startTimer(page, treadmill.id);
  await startTimer(page, anki.id);
}

function countAnimated(root: Element): number {
  return [root, ...root.querySelectorAll("*")].filter(
    (element) => getComputedStyle(element).animationName !== "none",
  ).length;
}

test.describe("ширина окна 390 px", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  for (const state of homeStates) {
    test(`45. на / с двумя идущими таймерами и сессиями за сегодня ${state.title} нет горизонтальной прокрутки`, async ({
      page,
    }) => {
      await twoRunningTimersWithTodaySessions(page);
      await page.goto("/");
      await expect(region(page, "Сейчас идут · 2")).toBeVisible();

      await state.open(page);

      await expectNoHorizontalScroll(page);
    });
  }
});

test("46. при prefers-reduced-motion: reduce у точки идущего таймера animation-name none", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await startTimer(page, anki.id);
  await page.goto("/");
  const running = runningNow(page);
  await expect(running).toBeVisible();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await running.evaluate(countAnimated)).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await running.evaluate(countAnimated)).toBe(0);
});
