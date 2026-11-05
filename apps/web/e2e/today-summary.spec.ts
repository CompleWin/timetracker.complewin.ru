import { expect, test, type Locator, type Page } from "@playwright/test";
import { createProject, createTask, type Task } from "./helpers/api.ts";
import { addLocalSession, afternoonZone, loginInZone, shortDateRu } from "./helpers/afternoon.ts";
import { island, textOf } from "./helpers/ui.ts";

type LanguagesAndSport = {
  anki: Task;
  run: Task;
};

const ZONE = afternoonZone();
const LEGEND_TEXT = /^(Языки|Спорт|1 ч|30 мин)$/;
const DAY_BAR_TITLE = /^\d{2}\.\d{2}: /;

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

function todaySummary(page: Page): Locator {
  return island(page, "Сводка за сегодня");
}

async function ankiInLanguagesAndRunInSport(page: Page): Promise<LanguagesAndSport> {
  const languages = await createProject(page, { name: "Языки" });
  const sport = await createProject(page, { name: "Спорт" });
  const anki = await createTask(page, { title: "Anki", projectId: languages.id });
  const run = await createTask(page, { title: "Бег", projectId: sport.id });
  return { anki, run };
}

test("39. «Anki» 10:00–11:00 и «Бег» 10:40–11:10: итог «1 ч 30 мин», строка «2 сессии · параллельно 20 мин», в легенде «Языки» и «1 ч» перед «Спорт» и «30 мин»", async ({
  page,
}) => {
  const { anki, run } = await ankiInLanguagesAndRunInSport(page);
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "11:00" });
  await addLocalSession(page, ZONE, run.id, { start: "10:40", end: "11:10" });

  await page.goto("/");

  const summary = todaySummary(page);
  await expect(textOf(summary, "1 ч 30 мин")).toBeVisible();
  await expect(textOf(summary, "2 сессии · параллельно 20 мин")).toBeVisible();
  await expect(summary.getByText(LEGEND_TEXT)).toHaveText(["Языки", "1 ч", "Спорт", "30 мин"]);
});

test("39. без пересечения сессий строка «2 сессии»", async ({ page }) => {
  const { anki, run } = await ankiInLanguagesAndRunInSport(page);
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "11:00" });
  await addLocalSession(page, ZONE, run.id, { start: "11:10", end: "11:40" });

  await page.goto("/");

  await expect(textOf(todaySummary(page), "2 сессии")).toBeVisible();
});

test("40. неделя из 7 столбиков: у последнего title «<сегодня>: 1 ч 30 мин», у предпоследнего «<вчера>: 2 ч»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "12:00", daysAgo: 1 });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "11:00" });
  await addLocalSession(page, ZONE, anki.id, { start: "11:00", end: "11:30" });

  await page.goto("/");

  const dayBars = todaySummary(page).getByTitle(DAY_BAR_TITLE);
  await expect(dayBars).toHaveCount(7);
  await expect(dayBars.nth(6)).toHaveAttribute("title", `${shortDateRu(ZONE)}: 1 ч 30 мин`);
  await expect(dayBars.nth(5)).toHaveAttribute("title", `${shortDateRu(ZONE, 1)}: 2 ч`);
});

test("41. без сессий за сегодня итог «0 мин», строка «0 сессий», легенды нет", async ({ page }) => {
  const languages = await createProject(page, { name: "Языки" });
  const anki = await createTask(page, { title: "Anki", projectId: languages.id });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "11:00", daysAgo: 1 });

  await page.goto("/");

  const summary = todaySummary(page);
  await expect(textOf(summary, "0 мин")).toBeVisible();
  await expect(textOf(summary, "0 сессий")).toBeVisible();
  await expect(textOf(summary, "Языки")).toHaveCount(0);
  await expect(textOf(summary, "Без проекта")).toHaveCount(0);
});
