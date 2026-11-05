import { expect, test } from "@playwright/test";
import { activeTimers, createTask, startTimer } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { stopTimerButton, startTimerButton } from "./helpers/picker.ts";
import { button, dialog, field, heading } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

test("43. «Изменить задачу» на странице задачи переименовывает её, заголовок страницы меняется", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await page.goto(`/tasks/${anki.id}`);

  await button(page, "Изменить задачу").click();
  const form = dialog(page, "Изменить задачу");
  await field(form, "Название").fill("Anki: слова");
  await button(form, "Сохранить").click();

  await expect(form).toBeHidden();
  await expect(heading(page, "Anki: слова")).toBeVisible();
});

test("43. «В архив» у задачи с идущим таймером останавливает его, убирает «Запустить таймер», «Добавить сессию» и «В архив», страница остаётся открытой", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await startTimer(page, anki.id);
  await page.goto(`/tasks/${anki.id}`);
  await expect(stopTimerButton(page, "Anki")).toBeVisible();

  await button(page, "В архив").click();

  await expect(button(page, "В архив")).toHaveCount(0);
  await expect(button(page, "Добавить сессию")).toHaveCount(0);
  await expect(startTimerButton(page, "Anki")).toHaveCount(0);
  await expect(stopTimerButton(page, "Anki")).toHaveCount(0);
  await expect(page).toHaveURL(urlMatching(`/tasks/${anki.id}`));
  await expect(heading(page, "Anki")).toBeVisible();
  await expect.poll(() => activeTimers(page)).toEqual([]);
});
