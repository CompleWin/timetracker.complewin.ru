import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  activeTimers,
  archiveProject,
  archiveTask,
  createProject,
  createTask,
  getTask,
  listTasks,
  pinTask,
  startTimer,
  taskSessions,
} from "./helpers/api.ts";
import { addLocalSession, afternoonZone, loginInZone } from "./helpers/afternoon.ts";
import { clockIn } from "./helpers/clock.ts";
import {
  alreadyRunningButton,
  expectPickerClosed,
  expectStartRows,
  expectTopToBottom,
  foundTasks,
  openPicker,
  pickerTrigger,
  projectTree,
  searchTasks,
  startTimerButton,
  taskSearch,
} from "./helpers/picker.ts";
import {
  button,
  dialog,
  field,
  group,
  link,
  menuItem,
  region,
  runningNow,
  textOf,
} from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

type TaskStart = [title: string, start: string, end: string];

const ZONE = afternoonZone();

const recentStarts: TaskStart[] = [
  ["Бег", "06:00", "06:30"],
  ["Чтение", "07:00", "07:30"],
  ["Отчёт", "08:00", "08:30"],
  ["Почта", "09:00", "09:30"],
  ["Зарядка", "10:00", "10:30"],
  ["Anki", "11:00", "11:30"],
];

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

function recentGroup(page: Page): Locator {
  return group(page, "Недавние");
}

function pinnedGroup(page: Page): Locator {
  return group(page, "Закреплённые");
}

function createRow(page: Page, text: string): Locator {
  return button(page, `Создать «${text}»`);
}

async function pressNInRussianLayout(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyN", key: "т", bubbles: true }),
    );
  });
}

async function lessonsMailAndForm(page: Page): Promise<void> {
  const lessons = await createProject(page, { name: "Уроки" });
  const misc = await createProject(page, { name: "Разное" });
  const review = await createTask(page, { title: "Разбор задачи", projectId: lessons.id });
  const mail = await createTask(page, { title: "Разбор почты" });
  await createTask(page, { title: "Анкета", projectId: misc.id });
  await addLocalSession(page, ZONE, review.id, { start: "09:00", end: "09:30" });
  await addLocalSession(page, ZONE, mail.id, { start: "10:00", end: "10:30" });
}

async function openHomeWithSearch(page: Page, text: string): Promise<void> {
  await lessonsMailAndForm(page);
  await page.goto("/");
  await searchTasks(page, text);
}

test.describe("открытие и закрытие панели", () => {
  test("22. триггер открывает панель с пустым полем «Поиск задач» в фокусе, Esc закрывает её и возвращает фокус на триггер", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = pickerTrigger(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();

    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(taskSearch(page)).toHaveValue("");
    await expect(taskSearch(page)).toBeFocused();

    await page.keyboard.press("Escape");

    await expectPickerClosed(page);
    await expect(trigger).toBeFocused();
  });

  test("22. клик мимо панели закрывает её", async ({ page }) => {
    await page.goto("/");
    await openPicker(page);

    await page.mouse.click(1, 1);

    await expectPickerClosed(page);
  });

  test("23. клавиша N на главной открывает панель, поле поиска пустое", async ({ page }) => {
    await page.goto("/");
    await expect(pickerTrigger(page)).toBeVisible();

    await page.keyboard.press("KeyN");

    await expect(pickerTrigger(page)).toHaveAttribute("aria-expanded", "true");
    await expect(taskSearch(page)).toBeVisible();
    await expect(taskSearch(page)).toHaveValue("");
  });

  test("23. keydown с code KeyN и key «т» тоже открывает панель", async ({ page }) => {
    await page.goto("/");
    await expect(pickerTrigger(page)).toBeVisible();

    await pressNInRussianLayout(page);

    await expect(pickerTrigger(page)).toHaveAttribute("aria-expanded", "true");
    await expect(taskSearch(page)).toHaveValue("");
  });

  test("23. в открытом диалоге «Новая сессия» клавиша N панель не открывает", async ({ page }) => {
    await page.goto("/");
    await button(page, "Добавить вручную").click();
    const form = dialog(page, "Новая сессия");
    await button(form, "Закрыть").focus();

    await page.keyboard.press("KeyN");

    await expect(form).toBeVisible();
    await expectPickerClosed(page);
  });
});

test.describe("список при пустом поиске", () => {
  test("24. в «Недавних» пять последних запущенных активных задач, свежие первыми, архивной нет", async ({
    page,
  }) => {
    for (const [title, start, end] of recentStarts) {
      const task = await createTask(page, { title });
      await addLocalSession(page, ZONE, task.id, { start, end });
    }
    const archived = await createTask(page, { title: "Старая задача" });
    await addLocalSession(page, ZONE, archived.id, { start: "12:00", end: "12:30" });
    await archiveTask(page, archived.id);
    await page.goto("/");

    await openPicker(page);

    await expectStartRows(recentGroup(page), ["Anki", "Зарядка", "Почта", "Отчёт", "Чтение"]);
  });

  test("25. в дереве «Проекты и задачи» строки «Спорт», «Учёба», «Языки», «Без проекта», архивного проекта нет, раскрыт только «Спорт»", async ({
    page,
  }) => {
    const sport = await createProject(page, { name: "Спорт" });
    const languages = await createProject(page, { name: "Языки" });
    await createProject(page, { name: "Учёба" });
    const old = await createProject(page, { name: "Старое" });
    await archiveProject(page, old.id);
    await createTask(page, { title: "Бег", projectId: sport.id });
    await createTask(page, { title: "Anki", projectId: languages.id });
    await createTask(page, { title: "Почта" });
    await page.goto("/");

    await openPicker(page);

    const tree = projectTree(page);
    const collapsed = ["Учёба", "Языки", "Без проекта"];
    await expectTopToBottom(["Спорт", ...collapsed].map((name) => button(tree, name)));
    await expect(button(tree, "Старое")).toHaveCount(0);
    await expect(button(tree, "Спорт")).toHaveAttribute("aria-expanded", "true");
    await expect(startTimerButton(group(page, "Спорт"), "Бег")).toBeVisible();
    for (const name of collapsed) {
      await expect(button(tree, name)).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("25. раскрытый проект без задач показывает «В проекте пока нет задач»", async ({ page }) => {
    const sport = await createProject(page, { name: "Спорт" });
    await createProject(page, { name: "Учёба" });
    await createTask(page, { title: "Бег", projectId: sport.id });
    await page.goto("/");
    await openPicker(page);

    await button(projectTree(page), "Учёба").click();

    await expect(button(projectTree(page), "Учёба")).toHaveAttribute("aria-expanded", "true");
    await expect(textOf(group(page, "Учёба"), "В проекте пока нет задач")).toBeVisible();
  });

  test("26. у пользователя без задач, но с проектом, в панели видны «Пока нет задач» и строка проекта", async ({
    page,
  }) => {
    await createProject(page, { name: "Учёба" });
    await page.goto("/");

    await openPicker(page);

    await expect(textOf(page, "Пока нет задач")).toBeVisible();
    await expect(button(projectTree(page), "Учёба")).toBeVisible();
  });
});

test.describe("поиск", () => {
  test("27. «разбор» находит «Разбор почты», затем «Разбор задачи», и строку «Создать «разбор»» с подписью «без проекта»", async ({
    page,
  }) => {
    await openHomeWithSearch(page, "разбор");

    await expectStartRows(foundTasks(page), ["Разбор почты", "Разбор задачи"]);
    await expect(createRow(page, "разбор")).toHaveAccessibleDescription("без проекта");
  });

  test("27. «уроки» находит одну задачу «Разбор задачи» по названию её проекта", async ({
    page,
  }) => {
    await openHomeWithSearch(page, "уроки");

    await expectStartRows(foundTasks(page), ["Разбор задачи"]);
  });

  test("27. «разбор #уро» находит одну задачу «Разбор задачи», подпись строки создания «Уроки»", async ({
    page,
  }) => {
    await openHomeWithSearch(page, "разбор #уро");

    await expectStartRows(foundTasks(page), ["Разбор задачи"]);
    await expect(createRow(page, "разбор")).toHaveAccessibleDescription("Уроки");
  });

  test("27. «xyz» показывает «Таких задач нет» и «Создать «xyz»»", async ({ page }) => {
    await openHomeWithSearch(page, "xyz");

    await expect(textOf(page, "Таких задач нет")).toBeVisible();
    await expect(createRow(page, "xyz")).toBeVisible();
    await expect(foundTasks(page)).toHaveCount(0);
  });

  test("27. при «анкета» строки создания нет", async ({ page }) => {
    await openHomeWithSearch(page, "анкета");

    await expectStartRows(foundTasks(page), ["Анкета"]);
    await expect(page.getByRole("button", { name: /^Создать «/ })).toHaveCount(0);
  });
});

test.describe("создание задачи из поиска", () => {
  test("28. «Чтение #уро» и Enter создают задачу «Чтение» в проекте «Уроки», закрывают панель и запускают таймер", async ({
    page,
  }) => {
    const lessons = await createProject(page, { name: "Уроки" });
    await page.goto("/");
    await searchTasks(page, "Чтение #уро");

    await page.keyboard.press("Enter");

    await expectPickerClosed(page);
    await expect(link(runningNow(page), "Чтение")).toBeVisible();
    expect(await listTasks(page)).toMatchObject([{ title: "Чтение", projectId: lessons.id }]);
  });

  test("28. «Новое #нет» подписано «такого проекта нет», строка создания создаёт и запускает «Новое» без проекта", async ({
    page,
  }) => {
    await createProject(page, { name: "Уроки" });
    await page.goto("/");
    await searchTasks(page, "Новое #нет");
    const create = createRow(page, "Новое");
    await expect(create).toHaveAccessibleDescription("такого проекта нет");

    await create.click();

    await expectPickerClosed(page);
    await expect(link(runningNow(page), "Новое")).toBeVisible();
    expect(await listTasks(page)).toMatchObject([{ title: "Новое", projectId: null }]);
  });

  test("29. при поиске «разбор» Enter запускает «Разбор почты», стрелка вниз и Enter запускают «Разбор задачи», Ctrl+Enter создаёт и запускает «разбор»", async ({
    page,
  }) => {
    await lessonsMailAndForm(page);
    await page.goto("/");

    await searchTasks(page, "разбор");
    await page.keyboard.press("Enter");
    await expect(link(runningNow(page), "Разбор почты")).toBeVisible();

    await searchTasks(page, "разбор");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(link(region(page, "Сейчас идут · 2"), "Разбор задачи")).toBeVisible();

    await searchTasks(page, "разбор");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(link(region(page, "Сейчас идут · 3"), "разбор")).toBeVisible();
    expect(await listTasks(page)).toContainEqual(
      expect.objectContaining({ title: "разбор", projectId: null }),
    );
  });
});

test.describe("строка задачи", () => {
  test("30. у идущей задачи строка «Уже идёт: Anki» с часами, нажатие закрывает панель без новой сессии", async ({
    page,
  }) => {
    const anki = await createTask(page, { title: "Anki" });
    const running = await startTimer(page, anki.id);
    await page.goto("/");
    await openPicker(page);
    const runningRow = button(recentGroup(page), "Уже идёт: Anki");
    await expect(runningRow).toBeVisible();
    await expect(clockIn(recentGroup(page))).toBeVisible();

    await runningRow.click();

    await expectPickerClosed(page);
    expect(await activeTimers(page)).toMatchObject([{ id: running.id }]);
    expect(await taskSessions(page, anki.id)).toHaveLength(1);
  });

  test("31. «Закрепить: Anki» добавляет группу «Закреплённые», она остаётся после перезагрузки, скрыта при поиске и уходит после «Открепить: Anki»", async ({
    page,
  }) => {
    const anki = await createTask(page, { title: "Anki" });
    await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });
    await page.goto("/");
    await openPicker(page);
    await expect(pinnedGroup(page)).toHaveCount(0);

    await button(recentGroup(page), "Закрепить: Anki").click();

    await expect(startTimerButton(pinnedGroup(page), "Anki")).toBeVisible();
    await expect(button(recentGroup(page), "Открепить: Anki")).toBeVisible();
    await expect(taskSearch(page)).toBeVisible();
    await expect.poll(async () => (await getTask(page, anki.id)).pinned).toBe(true);

    await page.reload();
    await openPicker(page);
    await expect(startTimerButton(pinnedGroup(page), "Anki")).toBeVisible();

    await taskSearch(page).fill("Anki");
    await expect(startTimerButton(foundTasks(page), "Anki")).toBeVisible();
    await expect(pinnedGroup(page)).toHaveCount(0);

    await taskSearch(page).fill("");
    await expect(startTimerButton(pinnedGroup(page), "Anki")).toBeVisible();
    await button(recentGroup(page), "Открепить: Anki").click();

    await expect(pinnedGroup(page)).toHaveCount(0);
    await expect(button(recentGroup(page), "Закрепить: Anki")).toBeVisible();
  });

  test("31. нажатие на чип в «Закреплённых» запускает таймер", async ({ page }) => {
    const anki = await createTask(page, { title: "Anki" });
    await pinTask(page, anki.id);
    await page.goto("/");
    await openPicker(page);

    await startTimerButton(pinnedGroup(page), "Anki").click();

    await expectPickerClosed(page);
    await expect(link(runningNow(page), "Anki")).toBeVisible();
  });

  test("32. «Открыть задачу: Anki» открывает страницу задачи «Anki»", async ({ page }) => {
    const anki = await createTask(page, { title: "Anki" });
    await page.goto("/");
    await openPicker(page);

    await link(page, "Открыть задачу: Anki").click();

    await expect(page).toHaveURL(urlMatching(`/tasks/${anki.id}`));
  });

  test("33. задача с сегодняшней остановленной сессией 40 мин показывает в своей строке «40 мин»", async ({
    page,
  }) => {
    const anki = await createTask(page, { title: "Anki" });
    await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:40" });
    await page.goto("/");

    await openPicker(page);

    await expect(startTimerButton(recentGroup(page), "Anki")).toBeVisible();
    await expect(textOf(recentGroup(page), "40 мин")).toBeVisible();
  });
});

test("34. «Создать», затем «Новая задача» закрывают панель и открывают диалог; созданная задача видна в дереве и в регионе «Сейчас идёт»", async ({
  page,
}) => {
  await page.goto("/");
  await openPicker(page);

  await button(page, "Создать").click();
  await menuItem(page, "Новая задача").click();

  const form = dialog(page, "Новая задача");
  await expect(form).toBeVisible();
  await expectPickerClosed(page);

  await field(form, "Название").fill("Anki");
  await button(form, "Создать").click();
  await expect(form).toBeHidden();

  await expect(link(runningNow(page), "Anki")).toBeVisible();
  await openPicker(page);
  await expect(alreadyRunningButton(group(page, "Без проекта"), "Anki")).toBeVisible();
});
