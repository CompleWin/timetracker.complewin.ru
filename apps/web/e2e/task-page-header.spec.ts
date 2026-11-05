import { expect, test, type Page } from "@playwright/test";
import {
  activeTimers,
  archiveProject,
  archiveTask,
  createProject,
  createTask,
  type Session,
} from "./helpers/api.ts";
import {
  addLocalSession,
  afternoonZone,
  localDateTimeRu,
  localTime,
  loginInZone,
  type LocalInterval,
} from "./helpers/afternoon.ts";
import { clockIn, expectClockTicks } from "./helpers/clock.ts";
import { PAGE_TITLE_FONT_SIZE } from "./helpers/layout.ts";
import { startTimerButton, stopTimerButton } from "./helpers/picker.ts";
import { byDayIsland, openTaskPage, taskHeader } from "./helpers/task-page.ts";
import { button, link, pageTitle, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type LastStartCase = {
  situation: string;
  shown: string;
  interval: LocalInterval;
  expected: (session: Session) => string;
};

const ZONE = afternoonZone();
const ACTIVE_NO_SESSIONS = "Сессий пока нет. Запусти таймер или добавь сессию вручную.";
const INACTIVE_NO_SESSIONS = "Сессий пока нет.";
const ARCHIVED_TASK_NOTICE =
  "Задача в архиве. Запустить её или добавить сессию нельзя, старые сессии можно править.";
const ARCHIVED_PROJECT_NOTICE =
  "Проект задачи в архиве. Запустить её или добавить сессию нельзя, старые сессии можно править.";
const TIMER_LINE_TEXT = /^(Идёт с |Последний раз: |Ещё не запускалась$)/;

const lastStartCases: LastStartCase[] = [
  {
    situation: "при остановленной сессии сегодня в 10:00",
    shown: "Последний раз: сегодня, 10:00",
    interval: { start: "10:00", end: "10:30" },
    expected: () => "Последний раз: сегодня, 10:00",
  },
  {
    situation: "при одной сессии вчера в 18:30",
    shown: "Последний раз: вчера, 18:30",
    interval: { start: "18:30", end: "19:00", daysAgo: 1 },
    expected: () => "Последний раз: вчера, 18:30",
  },
  {
    situation: "при одной сессии 5 дней назад",
    shown: "Последний раз: <formatDateTime её начала>",
    interval: { start: "10:00", end: "10:30", daysAgo: 5 },
    expected: (session) => `Последний раз: ${localDateTimeRu(ZONE, session.startedAt)}`,
  },
];

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

async function runningStartedAt(page: Page): Promise<string> {
  const [running] = await activeTimers(page);
  if (running === undefined) throw new Error("GET /api/timers/active returned no sessions");
  return running.startedAt;
}

test("3. ссылка «Трекер» ведёт на /, заголовок страницы h1 — название задачи с font-size 28 px", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await openTaskPage(page, anki);

  await expect(pageTitle(page, "Anki")).toBeVisible();
  await expect(pageTitle(page, "Anki")).toHaveCSS("font-size", PAGE_TITLE_FONT_SIZE);

  await link(page, "Трекер").click();

  await expect(page).toHaveURL(urlMatching("/"));
});

test("4. активная задача без сессий: «Ещё не запускалась», кнопка-иконка «Запустить таймер: Anki» без слова «Старт», «Сессий пока нет. Запусти таймер…», в «По дням» «За две недели времени нет»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await openTaskPage(page, anki);

  const start = startTimerButton(page, "Anki");
  await expect(textOf(page, "Ещё не запускалась")).toBeVisible();
  await expect(start).toBeVisible();
  await expect(start).toHaveAttribute("title", "Запустить таймер: Anki");
  await expect(start).not.toContainText("Старт");
  await expect(textOf(page, "Старт")).toHaveCount(0);
  await expect(textOf(page, ACTIVE_NO_SESSIONS)).toBeVisible();
  await expect(textOf(byDayIsland(page), "За две недели времени нет")).toBeVisible();
});

test("5. после «Запустить таймер: Anki» видно «Идёт с <время запуска>», часы меняются в течение 2 секунд, есть «Остановить таймер: Anki»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await openTaskPage(page, anki);

  await startTimerButton(page, "Anki").click();

  const stop = stopTimerButton(page, "Anki");
  await expect(stop).toBeVisible();
  await expect(stop).toHaveAttribute("title", "Остановить таймер: Anki");
  const startedAt = await runningStartedAt(page);
  await expect(textOf(page, `Идёт с ${localTime(ZONE, startedAt)}`)).toBeVisible();
  await expectClockTicks(clockIn(taskHeader(page, anki)));
});

for (const { situation, shown, interval, expected } of lastStartCases) {
  test(`6. ${situation} строка таймера «${shown}» и «Запустить таймер: Anki»`, async ({ page }) => {
    const anki = await createTask(page, { title: "Anki" });
    const session = await addLocalSession(page, ZONE, anki.id, interval);

    await openTaskPage(page, anki);

    await expect(textOf(page, expected(session))).toBeVisible();
    await expect(startTimerButton(page, "Anki")).toBeVisible();
  });
}

test("7. сегодня сессии 10:00–10:40 и 11:00–11:25: мета «сегодня 1 ч 5 мин · 2 сессии»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:40" });
  await addLocalSession(page, ZONE, anki.id, { start: "11:00", end: "11:25" });

  await openTaskPage(page, anki);

  await expect(textOf(page, "сегодня 1 ч 5 мин · 2 сессии")).toBeVisible();
});

test("7. только вчерашняя сессия: мета «сегодня 0 мин · 0 сессий»", async ({ page }) => {
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "18:00", end: "19:00", daysAgo: 1 });

  await openTaskPage(page, anki);

  await expect(textOf(page, "сегодня 0 мин · 0 сессий")).toBeVisible();
});

test("10. архивная задача: плашка «Задача в архиве…», нет строки таймера и «В архив»; «Вернуть» убирает плашку, появляются «Запустить таймер: Anki» и «В архив»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await archiveTask(page, anki.id);
  await openTaskPage(page, anki);

  await expect(textOf(page, ARCHIVED_TASK_NOTICE)).toBeVisible();
  await expect(page.getByText(TIMER_LINE_TEXT)).toHaveCount(0);
  await expect(startTimerButton(page, "Anki")).toHaveCount(0);
  await expect(button(page, "В архив")).toHaveCount(0);

  await button(page, "Вернуть").click();

  await expect(textOf(page, ARCHIVED_TASK_NOTICE)).toBeHidden();
  await expect(startTimerButton(page, "Anki")).toBeVisible();
  await expect(button(page, "В архив")).toBeVisible();
});

test("11. задача архивного проекта: плашка «Проект задачи в архиве…» без «Вернуть», без сессий «Сессий пока нет.»", async ({
  page,
}) => {
  const sport = await createProject(page, { name: "Спорт" });
  const run = await createTask(page, { title: "Бег", projectId: sport.id });
  await archiveProject(page, sport.id);

  await openTaskPage(page, run);

  await expect(textOf(page, ARCHIVED_PROJECT_NOTICE)).toBeVisible();
  await expect(button(page, "Вернуть")).toHaveCount(0);
  await expect(textOf(page, INACTIVE_NO_SESSIONS)).toBeVisible();
  await expect(textOf(page, ACTIVE_NO_SESSIONS)).toHaveCount(0);
});
