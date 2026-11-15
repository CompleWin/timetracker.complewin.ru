import { expect, test, type Locator, type Page } from "@playwright/test";
import { activeTimers, createTask, taskSessions } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { collectConsoleErrors } from "./helpers/console.ts";
import { expectNoHorizontalScroll } from "./helpers/layout.ts";
import {
  foundTasks,
  openPicker,
  pickerTrigger,
  searchTasks,
  startTimerButton,
} from "./helpers/picker.ts";
import {
  bottomEdge,
  boxOf,
  dragHandleBy,
  dragHandleTo,
  expectPanelSize,
  expectPx,
  expectSameEdge,
  expectStoredSize,
  handleCenter,
  isInside,
  leftEdge,
  panelHeight,
  panelSize,
  panelWidth,
  pickerRegion,
  rawPickerSize,
  resizeHandle,
  rightEdge,
  scrollHandleIntoView,
  storePickerSize,
  type Size,
} from "./helpers/picker-size.ts";
import { button, island } from "./helpers/ui.ts";

const DESKTOP = { width: 1280, height: 800 };
const NARROW_DESKTOP = { width: 1024, height: 800 };
const PHONE = { width: 390, height: 800 };

const MIN_WIDTH = 600;
const MIN_LIST_HEIGHT = 400;
const DEFAULT_LIST_HEIGHT = 600;
const KEY_STEP = 40;

const MANY_TASKS = 30;
const FEW_TASKS = 3;
const NO_TASKS = 0;
const TASK_ROW = /^Запустить таймер: Задача /;

test.use({ viewport: DESKTOP });

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

function addManually(page: Page): Locator {
  return button(page, "Добавить вручную");
}

async function createTasks(page: Page, count: number): Promise<void> {
  const titles = Array.from({ length: count }, (_, index) => `Задача ${index + 1}`);
  await Promise.all(titles.map((title) => createTask(page, { title })));
}

async function openPickerWithRows(page: Page, taskCount: number): Promise<void> {
  await openPicker(page);
  await expect(pickerRegion(page).getByRole("button", { name: TASK_ROW })).toHaveCount(taskCount);
}

async function expectPanelLeftAtTrigger(page: Page): Promise<void> {
  await expectSameEdge(
    () => leftEdge(pickerRegion(page)),
    () => leftEdge(pickerTrigger(page)),
  );
}

async function expectPanelRightAtAddManually(page: Page): Promise<void> {
  await expectSameEdge(
    () => rightEdge(pickerRegion(page)),
    () => rightEdge(addManually(page)),
  );
}

async function expectPanelAlignedWithTrigger(page: Page): Promise<void> {
  await expectPanelLeftAtTrigger(page);
  await expectSameEdge(
    () => rightEdge(pickerRegion(page)),
    () => rightEdge(pickerTrigger(page)),
  );
}

async function openDefaultPanel(page: Page, taskCount: number): Promise<Size> {
  await createTasks(page, taskCount);
  await page.goto("/");
  await openPickerWithRows(page, taskCount);
  await expectPanelRightAtAddManually(page);
  return panelSize(page);
}

async function openPanelWithManyTasks(page: Page): Promise<Size> {
  test.slow();
  return openDefaultPanel(page, MANY_TASKS);
}

async function expectPanelOpen(page: Page): Promise<void> {
  await expect(pickerRegion(page)).toBeVisible();
  await expect(pickerTrigger(page)).toHaveAttribute("aria-expanded", "true");
}

async function expectNoSavedSize(page: Page): Promise<void> {
  await expect.poll(() => rawPickerSize(page)).toBeNull();
}

test("1. без сохранённого размера регион «Выбор задачи» тянется от левого края триггера до правого края «Добавить вручную» и в окне 1024 x 800, у кнопки «Изменить размер панели» такой же title и подсказка про стрелки", async ({
  page,
}) => {
  await page.goto("/");

  await openPicker(page);

  await expectPanelLeftAtTrigger(page);
  await expectPanelRightAtAddManually(page);
  const handle = resizeHandle(page);
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("title", "Изменить размер панели");
  await expect(handle).toHaveAccessibleDescription(
    "Стрелки меняют размер, Home возвращает обычный",
  );

  await page.setViewportSize(NARROW_DESKTOP);

  await expectPanelRightAtAddManually(page);
});

test.describe("перетаскивание ручки", () => {
  test("2. много задач: сдвиг на -150 и -120 px уменьшает ширину на 150 px и высоту на 120 px, записан список 480 px, размер остаётся после перезагрузки", async ({
    page,
  }) => {
    const defaults = await openPanelWithManyTasks(page);
    const shrunk = { width: defaults.width - 150, height: defaults.height - 120 };

    await dragHandleBy(page, { x: -150, y: -120 });

    await expectPanelSize(page, shrunk);
    await expectStoredSize(page, { width: defaults.width - 150, listHeight: 480 });

    await page.reload();
    await openPickerWithRows(page, MANY_TASKS);

    await expectPanelSize(page, shrunk);
  });

  test("3. много задач: сдвиг на -2000 px даёт ширину 600 px и список 400 px вместо 600 px, сдвиг на +2000 px возвращает размер по умолчанию", async ({
    page,
  }) => {
    const defaults = await openPanelWithManyTasks(page);

    await dragHandleBy(page, { x: -2000, y: -2000 });

    await expectPanelSize(page, {
      width: MIN_WIDTH,
      height: defaults.height - (DEFAULT_LIST_HEIGHT - MIN_LIST_HEIGHT),
    });

    await dragHandleBy(page, { x: 2000, y: 2000 });

    await expectPanelSize(page, defaults);
  });

  test("4. три задачи: сдвиг на -100 px вверх высоту региона не меняет, записан список 500 px", async ({
    page,
  }) => {
    const defaults = await openDefaultPanel(page, FEW_TASKS);

    await dragHandleBy(page, { x: 0, y: -100 });

    await expectStoredSize(page, { width: defaults.width, listHeight: 500 });
    await expectPx(() => panelHeight(page), defaults.height);
  });

  test("7. после уменьшения двойной клик по ручке возвращает размер по умолчанию и удаляет ключ", async ({
    page,
  }) => {
    const defaults = await openPanelWithManyTasks(page);
    await dragHandleBy(page, { x: -100, y: -80 });
    await expect.poll(() => rawPickerSize(page)).not.toBeNull();

    await resizeHandle(page).dblclick();

    await expectPanelSize(page, defaults);
    await expectNoSavedSize(page);
  });

  test("8. без задач: сдвиг на -100 px влево и +300 px вниз, отпущенный над островком «Хронология» ниже панели, оставляет панель открытой и записывает ширину на 100 px меньше и список 600 px", async ({
    page,
  }) => {
    const defaults = await openDefaultPanel(page, NO_TASKS);
    await scrollHandleIntoView(page);
    const timeline = await boxOf(island(page, "Хронология"));
    const panelBottom = await bottomEdge(pickerRegion(page));
    const start = await handleCenter(page);
    const target = { x: start.x - 100, y: start.y + 300 };
    expect(target.y).toBeGreaterThan(panelBottom);
    expect(target.y).toBeLessThan(DESKTOP.height);
    expect(isInside(target, timeline)).toBe(true);

    await dragHandleTo(page, target);

    await expectPanelOpen(page);
    await expectStoredSize(page, {
      width: defaults.width - 100,
      listHeight: DEFAULT_LIST_HEIGHT,
    });
  });
});

test.describe("клавиатура на ручке", () => {
  test("5. много задач: стрелка влево дважды уменьшает ширину на 80 px, стрелка вверх уменьшает высоту на 40 px, Home возвращает размер по умолчанию и удаляет ключ, стрелка вправо при ширине по умолчанию ничего не меняет и не записывает", async ({
    page,
  }) => {
    const defaults = await openPanelWithManyTasks(page);
    await resizeHandle(page).focus();

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expectPx(() => panelWidth(page), defaults.width - 2 * KEY_STEP);

    const heightBefore = await panelHeight(page);
    await page.keyboard.press("ArrowUp");
    await expectPx(() => panelHeight(page), heightBefore - KEY_STEP);

    await page.keyboard.press("Home");
    await expectPanelSize(page, defaults);
    await expectNoSavedSize(page);

    await page.keyboard.press("ArrowRight");
    await expectPx(() => panelWidth(page), defaults.width);
    expect(await rawPickerSize(page)).toBeNull();
  });

  test("6. при поиске «Отчёт» Enter и стрелка вниз на ручке не запускают таймер подсвеченной задачи «Отчёт», панель открыта, новой сессии нет", async ({
    page,
  }) => {
    const report = await createTask(page, { title: "Отчёт" });
    await page.goto("/");
    await searchTasks(page, "Отчёт");
    await expect(startTimerButton(foundTasks(page), "Отчёт")).toBeVisible();
    await resizeHandle(page).focus();

    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");

    await expectPanelOpen(page);
    expect(await taskSessions(page, report.id)).toEqual([]);
    expect(await activeTimers(page)).toEqual([]);
  });
});

test.describe("сохранённый размер и размер окна", () => {
  test("9. в окне 390 x 800 сохранённый размер 800 x 600 не применяется: ручки нет, края региона совпадают с краями триггера, без горизонтальной прокрутки; в окне 1280 x 800 без перезагрузки панель открыта шириной 800 px", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await storePickerSize(page, '{"width":800,"listHeight":600}');
    await page.goto("/");

    await openPicker(page);

    await expect(resizeHandle(page)).toBeHidden();
    await expectPanelAlignedWithTrigger(page);
    await expectNoHorizontalScroll(page);

    await page.setViewportSize(DESKTOP);

    await expectPanelOpen(page);
    await expectPx(() => panelWidth(page), 800);
  });

  test("10. сохранённый размер 5000 x 5000 урезается до правого края «Добавить вручную» в окнах 1280 и 1024 px, значение в хранилище не меняется", async ({
    page,
  }) => {
    const huge = '{"width":5000,"listHeight":5000}';
    await storePickerSize(page, huge);
    await page.goto("/");

    await openPicker(page);
    await expectPanelRightAtAddManually(page);

    await page.setViewportSize(NARROW_DESKTOP);
    await expectPanelRightAtAddManually(page);

    expect(await rawPickerSize(page)).toBe(huge);
  });

  test("11. значения «abc» и ширина -1 в хранилище дают размер по умолчанию без ошибок в консоли", async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    const defaults = await openPanelWithManyTasks(page);

    for (const broken of ["abc", '{"width":-1,"listHeight":500}']) {
      await storePickerSize(page, broken);
      await page.reload();
      await openPickerWithRows(page, MANY_TASKS);

      await expectPanelSize(page, defaults);
    }
    expect(consoleErrors).toEqual([]);
  });
});
