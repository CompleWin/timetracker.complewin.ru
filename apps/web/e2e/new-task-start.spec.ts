import { expect, test, type Page, type Response } from "@playwright/test";
import {
  activeTimers,
  archiveProject,
  createProject,
  createTask,
  getTask,
  listTasks,
  startTimer,
  type Task,
} from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import {
  alreadyRunningButton,
  createTaskInDialog,
  openCreateDialog,
  openPicker,
  projectTree,
  startTimerButton,
  stopTimerButton,
  submitNewTask,
} from "./helpers/picker.ts";
import {
  moveTaskToProject,
  openTaskEditor,
  openTaskPage,
  saveTaskEditor,
  taskHeader,
} from "./helpers/task-page.ts";
import { button, field, group, link, region, runningNow, textOf } from "./helpers/ui.ts";

const MAX_RUNNING_TIMERS = 20;
const TOO_MANY_RUNNING_TEXT = "Задача создана, но таймер не запущен: уже идут 20 таймеров";
const TASK_START_PATH = /^\/api\/tasks\/[^/]+\/start$/;

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

function isTaskStart(response: Response): boolean {
  const { pathname } = new URL(response.url());
  return response.request().method() === "POST" && TASK_START_PATH.test(pathname);
}

async function startTimersOfNewTasks(page: Page, count: number): Promise<void> {
  const titles = Array.from({ length: count }, (_, index) => `Задача ${index + 1}`);
  const tasks = await Promise.all(titles.map((title) => createTask(page, { title })));
  await Promise.all(tasks.map((task) => startTimer(page, task.id)));
}

async function expectHeaderProject(
  page: Page,
  task: Task,
  shown: string,
  previous: string,
): Promise<void> {
  const header = taskHeader(page, task);
  await expect(textOf(header, shown)).toBeVisible();
  await expect(textOf(header, previous)).toHaveCount(0);
}

async function openTreeOnHome(page: Page): Promise<void> {
  await page.goto("/");
  await openPicker(page);
}

test.describe("диалог «Новая задача» запускает задачу", () => {
  test("1. «Отчёт» без проекта: диалог закрыт, в «Сейчас идёт» «Отчёт» с «Остановить таймер: Отчёт», в дереве «Отчёт» в группе «Без проекта»", async ({
    page,
  }) => {
    await page.goto("/");

    await createTaskInDialog(page, "Отчёт", "Без проекта");

    const running = runningNow(page);
    await expect(link(running, "Отчёт")).toBeVisible();
    await expect(stopTimerButton(running, "Отчёт")).toBeVisible();
    await openPicker(page);
    await expect(alreadyRunningButton(group(page, "Без проекта"), "Отчёт")).toBeVisible();
  });

  test("2. «Отчёт» в проекте «Спорт»: в «Сейчас идёт» у «Отчёт» проект «Спорт», в дереве «Отчёт» в группе «Спорт»", async ({
    page,
  }) => {
    const sport = await createProject(page, { name: "Спорт" });
    await page.goto("/");

    await createTaskInDialog(page, "Отчёт", "Спорт");

    const running = runningNow(page);
    await expect(link(running, "Отчёт")).toBeVisible();
    await expect(textOf(running, "Спорт")).toBeVisible();
    await openPicker(page);
    await expect(alreadyRunningButton(group(page, "Спорт"), "Отчёт")).toBeVisible();
    expect(await listTasks(page)).toMatchObject([{ title: "Отчёт", projectId: sport.id }]);
  });

  test("3. при идущем таймере «Anki» задача «Отчёт» из диалога тоже запускается: в «Сейчас идут · 2» обе задачи", async ({
    page,
  }) => {
    const anki = await createTask(page, { title: "Anki" });
    await startTimer(page, anki.id);
    await page.goto("/");

    await createTaskInDialog(page, "Отчёт", "Без проекта");

    await expect(region(page, "Сейчас идут · 2").getByRole("link")).toHaveText(["Anki", "Отчёт"]);
  });

  test("4. при 20 идущих таймерах «Создать» в диалоге: диалог открыт с «Задача создана, но таймер не запущен: уже идут 20 таймеров», «Создать» и поля выключены; после «Закрыть» «Отчёт» в дереве без таймера, в «Сейчас идут · 20» его нет", async ({
    page,
  }) => {
    test.slow();
    await startTimersOfNewTasks(page, MAX_RUNNING_TIMERS);
    await page.goto("/");

    const startAttempt = page.waitForResponse(isTaskStart);
    const form = await submitNewTask(page, "Отчёт", "Без проекта");
    expect((await startAttempt).status()).toBe(409);

    await expect(form).toBeVisible();
    await expect(textOf(form, TOO_MANY_RUNNING_TEXT)).toBeVisible();
    await expect(button(form, "Создать")).toBeDisabled();
    await expect(field(form, "Название")).toBeDisabled();
    await expect(field(form, "Проект")).toBeDisabled();

    await button(form, "Закрыть").click();
    await expect(form).toBeHidden();

    const running = region(page, `Сейчас идут · ${MAX_RUNNING_TIMERS}`);
    await expect(running).toBeVisible();
    await expect(link(running, "Отчёт")).toHaveCount(0);
    await openPicker(page);
    await expect(startTimerButton(group(page, "Без проекта"), "Отчёт")).toBeVisible();
    expect(await activeTimers(page)).toHaveLength(MAX_RUNNING_TIMERS);
    expect(await listTasks(page)).toContainEqual(
      expect.objectContaining({ title: "Отчёт", runningSessionId: null }),
    );
  });

  test("10. диалог «Новая задача» открыт, название введено: без сети «Создать» выключена, когда сеть вернулась, включена", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const form = await openCreateDialog(page, "Новая задача");
    await field(form, "Название").fill("Отчёт");
    const create = button(form, "Создать");
    await expect(create).toBeEnabled();

    await context.setOffline(true);

    await expect(create).toBeDisabled();

    await context.setOffline(false);

    await expect(create).toBeEnabled();
  });
});

test.describe("«Изменить задачу» меняет проект задачи", () => {
  test("5. задаче без проекта ставит проект «Спорт»: в островке-заголовке «Спорт», в дереве задача в группе «Спорт»", async ({
    page,
  }) => {
    const sport = await createProject(page, { name: "Спорт" });
    const anki = await createTask(page, { title: "Anki" });
    await openTaskPage(page, anki);

    await moveTaskToProject(page, "Спорт");

    await expectHeaderProject(page, anki, "Спорт", "Без проекта");
    await expect.poll(() => getTask(page, anki.id)).toMatchObject({ projectId: sport.id });
    await openTreeOnHome(page);
    await expect(startTimerButton(group(page, "Спорт"), "Anki")).toBeVisible();
  });

  test("6. задаче проекта «Спорт» меняет проект на «Учёба»: в островке-заголовке «Учёба», в группе «Спорт» задачи нет, в группе «Учёба» есть", async ({
    page,
  }) => {
    const sport = await createProject(page, { name: "Спорт" });
    await createProject(page, { name: "Учёба" });
    const run = await createTask(page, { title: "Бег", projectId: sport.id });
    await openTaskPage(page, run);

    await moveTaskToProject(page, "Учёба");

    await expectHeaderProject(page, run, "Учёба", "Спорт");
    await openTreeOnHome(page);
    await expect(textOf(group(page, "Спорт"), "В проекте пока нет задач")).toBeVisible();
    await expect(startTimerButton(group(page, "Спорт"), "Бег")).toHaveCount(0);
    await button(projectTree(page), "Учёба").click();
    await expect(startTimerButton(group(page, "Учёба"), "Бег")).toBeVisible();
  });

  test("7. задаче проекта «Спорт» снимает проект: в островке-заголовке «Без проекта», в дереве задача в группе «Без проекта»", async ({
    page,
  }) => {
    const sport = await createProject(page, { name: "Спорт" });
    const run = await createTask(page, { title: "Бег", projectId: sport.id });
    await openTaskPage(page, run);

    await moveTaskToProject(page, "Без проекта");

    await expectHeaderProject(page, run, "Без проекта", "Спорт");
    await expect.poll(() => getTask(page, run.id)).toMatchObject({ projectId: null });
    await openTreeOnHome(page);
    await button(projectTree(page), "Без проекта").click();
    await expect(startTimerButton(group(page, "Без проекта"), "Бег")).toBeVisible();
  });

  test("8. смена проекта у задачи с идущим таймером: таймер идёт, в строке «Сейчас идёт» новый проект «Учёба»", async ({
    page,
  }) => {
    const sport = await createProject(page, { name: "Спорт" });
    await createProject(page, { name: "Учёба" });
    const run = await createTask(page, { title: "Бег", projectId: sport.id });
    const session = await startTimer(page, run.id);
    await openTaskPage(page, run);

    await moveTaskToProject(page, "Учёба");

    await expectHeaderProject(page, run, "Учёба", "Спорт");
    await expect(stopTimerButton(page, "Бег")).toBeVisible();
    expect(await activeTimers(page)).toMatchObject([{ id: session.id, endedAt: null }]);
    await page.goto("/");
    const running = runningNow(page);
    await expect(link(running, "Бег")).toBeVisible();
    await expect(textOf(running, "Учёба")).toBeVisible();
    await expect(textOf(running, "Спорт")).toHaveCount(0);
  });

  test("9. у задачи архивного проекта выбрано «Без проекта», архивного проекта в списке нет; смена только названия оставляет её в архивном проекте", async ({
    page,
  }) => {
    const old = await createProject(page, { name: "Старое" });
    await createProject(page, { name: "Учёба" });
    const report = await createTask(page, { title: "Отчёт", projectId: old.id });
    await archiveProject(page, old.id);
    await openTaskPage(page, report);

    const form = await openTaskEditor(page);
    const projectList = field(form, "Проект");
    await expect(projectList.getByRole("option")).toHaveText(["Без проекта", "Учёба"]);
    await expect(
      projectList.getByRole("option", { name: "Без проекта", selected: true }),
    ).toHaveCount(1);
    await field(form, "Название").fill("Отчёт за год");
    await saveTaskEditor(form);

    await expect
      .poll(() => getTask(page, report.id))
      .toMatchObject({ title: "Отчёт за год", projectId: old.id });
  });
});
