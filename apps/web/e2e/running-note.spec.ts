import { expect, test, type Locator, type Page } from "@playwright/test";
import { createTask, getSession, startTimer, type Session } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { button, runningNow, textOf } from "./helpers/ui.ts";

type HorizontalBounds = {
  left: number;
  right: number;
};

const TITLE = "Anki";
const NOTE = "повторил 50 карточек";

function noteButton(page: Page): Locator {
  return button(runningNow(page), `Написать заметку: ${TITLE}`);
}

function stopButton(page: Page): Locator {
  return button(runningNow(page), `Остановить таймер: ${TITLE}`);
}

function noteField(page: Page): Locator {
  return runningNow(page).getByLabel(`Заметка: ${TITLE}`, { exact: true });
}

function savedMark(page: Page): Locator {
  return textOf(runningNow(page), "Сохранено");
}

async function openHomeWithRunningTimer(page: Page): Promise<Session> {
  await loginAs(page);
  const task = await createTask(page, { title: TITLE });
  const session = await startTimer(page, task.id);
  await page.goto("/");
  return session;
}

async function expectNoteHidden(page: Page): Promise<void> {
  await expect(noteButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(noteField(page)).toBeHidden();
}

async function openNote(page: Page): Promise<void> {
  await noteButton(page).click();
  await expect(noteField(page)).toBeVisible();
  await expect(noteButton(page)).toHaveAttribute("aria-expanded", "true");
}

async function savedNoteOf(page: Page, session: Session): Promise<string> {
  const { note } = await getSession(page, session.id);
  return note;
}

async function horizontalBounds(element: Locator): Promise<HorizontalBounds> {
  await expect(element).toBeVisible();
  const box = await element.boundingBox();
  if (box === null) throw new Error("element has no bounding box");
  return { left: box.x, right: box.x + box.width };
}

test("16. кнопка «Написать заметку: <название>» стоит слева от «Стоп»", async ({ page }) => {
  await openHomeWithRunningTimer(page);

  const noteBounds = await horizontalBounds(noteButton(page));
  const stopBounds = await horizontalBounds(stopButton(page));

  expect(noteBounds.right).toBeLessThanOrEqual(stopBounds.left);
});

test("16. поле «Заметка: <название>» скрыто до нажатия «Написать заметку: <название>», после «Сохранено» и перезагрузки снова скрыто, а текст на месте", async ({
  page,
}) => {
  await openHomeWithRunningTimer(page);
  await expectNoteHidden(page);

  await openNote(page);
  await expect(noteField(page)).toBeFocused();
  await expect(savedMark(page)).toBeHidden();
  await noteField(page).fill(NOTE);
  await expect(savedMark(page)).toBeVisible();

  await page.reload();
  await expectNoteHidden(page);
  await openNote(page);
  await expect(noteField(page)).toHaveValue(NOTE);
});

test("23. повторное нажатие на «Написать заметку: <название>» скрывает поле", async ({ page }) => {
  await openHomeWithRunningTimer(page);
  await openNote(page);

  await noteButton(page).click();

  await expectNoteHidden(page);
});

test("23. текст, введённый и сразу скрытый без ожидания «Сохранено», сохраняется в заметке сессии и виден после перезагрузки", async ({
  page,
}) => {
  const session = await openHomeWithRunningTimer(page);
  await openNote(page);

  await noteField(page).fill(NOTE);
  await noteButton(page).click();

  await expectNoteHidden(page);
  await expect.poll(() => savedNoteOf(page, session)).toBe(NOTE);
  await page.reload();
  await openNote(page);
  await expect(noteField(page)).toHaveValue(NOTE);
});
