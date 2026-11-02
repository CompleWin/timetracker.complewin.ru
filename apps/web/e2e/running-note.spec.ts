import { expect, test, type Locator, type Page } from "@playwright/test";
import { createTask, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { runningNow, textOf } from "./helpers/ui.ts";

const NOTE = "повторил 50 карточек";

function noteField(page: Page, title: string): Locator {
  return runningNow(page).getByLabel(`Заметка: ${title}`, { exact: true });
}

function savedMark(page: Page): Locator {
  return textOf(runningNow(page), "Сохранено");
}

test("16. заметка идущего таймера после «Сохранено» остаётся на месте после перезагрузки", async ({
  page,
}) => {
  await loginAs(page);
  const task = await createTask(page, { title: "Anki" });
  await startTimer(page, task.id);
  await page.goto("/");
  await expect(noteField(page, "Anki")).toHaveValue("");
  await expect(savedMark(page)).toHaveCount(0);

  await noteField(page, "Anki").fill(NOTE);

  await expect(savedMark(page)).toBeVisible();
  await page.reload();
  await expect(noteField(page, "Anki")).toHaveValue(NOTE);
});
