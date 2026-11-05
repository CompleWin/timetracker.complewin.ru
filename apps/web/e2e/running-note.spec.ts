import { expect, test, type Locator, type Page } from "@playwright/test";
import { createTask, getSession, startTimer, type Session } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { button, runningNow, textOf } from "./helpers/ui.ts";

type CloseNote = {
  way: string;
  close: (page: Page) => Promise<void>;
};

const TITLE = "Anki";
const NOTE = "повторил 50 карточек";
const EMPTY_NOTE_TEXT = "Заметка";

const keyboardClosingWays: CloseNote[] = [
  { way: "Enter", close: (page) => page.keyboard.press("Enter") },
  { way: "Esc", close: (page) => page.keyboard.press("Escape") },
];

const closingWays: CloseNote[] = [
  ...keyboardClosingWays,
  { way: "клик мимо поля", close: (page) => page.mouse.click(1, 1) },
];

function noteButton(page: Page): Locator {
  return button(runningNow(page), `Написать заметку: ${TITLE}`);
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

async function openNote(page: Page): Promise<void> {
  await noteButton(page).click();
  await expect(noteField(page)).toBeVisible();
}

async function expectNoteClosed(page: Page, shown: string): Promise<void> {
  await expect(noteField(page)).toBeHidden();
  await expect(noteButton(page)).toHaveText(shown);
}

async function savedNoteOf(page: Page, session: Session): Promise<string> {
  const { note } = await getSession(page, session.id);
  return note;
}

test("16. поле «Заметка: Anki» скрыто, кнопка «Написать заметку: Anki» показывает «Заметка»; нажатие открывает поле в фокусе; после «Сохранено» и перезагрузки кнопка показывает текст, а поле получает его снова", async ({
  page,
}) => {
  await openHomeWithRunningTimer(page);
  await expectNoteClosed(page, EMPTY_NOTE_TEXT);

  await openNote(page);
  await expect(noteField(page)).toBeFocused();
  await expect(savedMark(page)).toBeHidden();
  await noteField(page).fill(NOTE);
  await expect(savedMark(page)).toBeVisible();

  await page.reload();

  await expectNoteClosed(page, NOTE);
  await openNote(page);
  await expect(noteField(page)).toHaveValue(NOTE);
});

for (const { way, close } of closingWays) {
  test(`23. ${way} сразу после ввода закрывает поле «Заметка: Anki» и сохраняет текст, после перезагрузки заметка та же`, async ({
    page,
  }) => {
    const session = await openHomeWithRunningTimer(page);
    await openNote(page);
    await noteField(page).fill(NOTE);

    await close(page);

    await expectNoteClosed(page, NOTE);
    await expect.poll(() => savedNoteOf(page, session)).toBe(NOTE);
    await page.reload();
    await expectNoteClosed(page, NOTE);
  });
}

for (const { way, close } of keyboardClosingWays) {
  test(`23. после закрытия поля через ${way} фокус на кнопке «Написать заметку: Anki»`, async ({
    page,
  }) => {
    await openHomeWithRunningTimer(page);
    await openNote(page);
    await noteField(page).fill(NOTE);

    await close(page);

    await expect(noteButton(page)).toBeFocused();
  });
}

test("23. Shift+Enter переносит строку и оставляет поле «Заметка: Anki» открытым", async ({
  page,
}) => {
  await openHomeWithRunningTimer(page);
  await openNote(page);

  await noteField(page).pressSequentially("первая");
  await page.keyboard.press("Shift+Enter");
  await noteField(page).pressSequentially("вторая");

  await expect(noteField(page)).toBeVisible();
  await expect(noteField(page)).toHaveValue("первая\nвторая");
});
