import { expect, test, type Page } from "@playwright/test";
import { createTask, type Task } from "./helpers/api.ts";
import {
  addLocalSession,
  afternoonZone,
  dayMonthRu,
  localDateRu,
  loginInZone,
  shortDateRu,
  weekdayShortRu,
  type LocalInterval,
} from "./helpers/afternoon.ts";
import { byDayIsland, openTaskPage } from "./helpers/task-page.ts";
import { expectInSection, textOf } from "./helpers/ui.ts";

type DayGroup = {
  heading: string;
  caption: string;
  total: string;
};

const ZONE = afternoonZone();
const EDIT_SESSION = /^Изменить сессию /;
const DAY_BAR_TITLE = /^\d{2}\.\d{2}: /;

const sessionsNewestFirst: LocalInterval[] = [
  { start: "11:00", end: "11:25", note: "разобрал 20 слов" },
  { start: "10:00", end: "10:40", note: "повторил 50 карточек" },
  { start: "19:00", end: "19:15", daysAgo: 1 },
  { start: "18:00", end: "18:30", daysAgo: 1, note: "новая колода" },
  { start: "10:30", end: "10:50", daysAgo: 3, note: "аудирование" },
  { start: "09:00", end: "10:00", daysAgo: 3, note: "грамматика" },
];

const twoWeeksOfSessions: LocalInterval[] = [
  { start: "10:00", end: "11:00" },
  { start: "10:00", end: "10:30", daysAgo: 1 },
  { start: "10:00", end: "12:00", daysAgo: 10 },
  { start: "10:00", end: "11:00", daysAgo: 20 },
];

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

function dayGroups(): DayGroup[] {
  return [
    { heading: "Сегодня", caption: dayAndWeekday(0), total: "1 ч 5 мин" },
    { heading: "Вчера", caption: dayAndWeekday(1), total: "45 мин" },
    { heading: dayMonthRu(ZONE, 3), caption: weekdayShortRu(ZONE, 3), total: "1 ч 20 мин" },
  ];
}

function dayAndWeekday(daysAgo: number): string {
  return `${dayMonthRu(ZONE, daysAgo)}, ${weekdayShortRu(ZONE, daysAgo)}`;
}

async function addSessions(page: Page, task: Task, intervals: LocalInterval[]): Promise<string[]> {
  const editLabels: string[] = [];
  for (const interval of intervals) {
    const session = await addLocalSession(page, ZONE, task.id, interval);
    const date = localDateRu(ZONE, session.startedAt);
    editLabels.push(`Изменить сессию ${date} ${interval.start}–${interval.end}`);
  }
  return editLabels;
}

async function expectEditButtonsInOrder(page: Page, labels: string[]): Promise<void> {
  const editButtons = page.getByRole("button", { name: EDIT_SESSION });
  await expect(editButtons).toHaveCount(labels.length);
  for (const [index, label] of labels.entries()) {
    await expect(editButtons.nth(index)).toHaveAccessibleName(label);
  }
}

test("8. сессии сегодня, вчера и три дня назад стоят тремя группами по порядку с подписью и итогом дня, у сессии без заметки «Без заметки», кнопки «Изменить сессию <дата> <интервал>» на месте", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  const editLabels = await addSessions(page, anki, sessionsNewestFirst);

  await openTaskPage(page, anki);

  const groups = dayGroups();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(
    groups.map((group) => group.heading),
  );
  for (const group of groups) {
    await expectInSection(page, group.heading, textOf(page, group.caption));
    await expectInSection(page, group.heading, textOf(page, group.total));
  }
  await expect(textOf(page, "Без заметки")).toHaveCount(1);
  await expectInSection(page, "Вчера", textOf(page, "Без заметки"));
  await expectEditButtonsInOrder(page, editLabels);
});

test("9. сессии сегодня 1 ч, вчера 30 мин, 10 дней назад 2 ч и 20 дней назад 1 ч: 14 столбиков, «3 дня из 14, в среднем 1 ч 10 мин за день», у последнего title «<сегодня>: 1 ч»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await addSessions(page, anki, twoWeeksOfSessions);

  await openTaskPage(page, anki);

  const byDay = byDayIsland(page);
  const dayBars = byDay.getByTitle(DAY_BAR_TITLE);
  await expect(dayBars).toHaveCount(14);
  await expect(dayBars.last()).toHaveAttribute("title", `${shortDateRu(ZONE)}: 1 ч`);
  await expect(textOf(byDay, "3 дня из 14, в среднем 1 ч 10 мин за день")).toBeVisible();
});
