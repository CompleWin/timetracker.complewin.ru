import { expect, test } from "@playwright/test";
import { createTask, startTimer } from "./helpers/api.ts";
import { afternoonZone, localTime, loginInZone } from "./helpers/afternoon.ts";
import { button, dialog, field, link, textOf } from "./helpers/ui.ts";

const ZONE = afternoonZone();
const RUNNING_END_HINT = "Пусто, пока сессия идёт. Укажи время, чтобы остановить её в этот момент.";

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

test("42. в «Сессия» идущей сессии «Конец» пуст и под ним подсказка, у «Заметки» placeholder «Что сделано»", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  const running = await startTimer(page, anki.id);
  await page.goto("/");

  await button(page, `Изменить сессию Anki, ${localTime(ZONE, running.startedAt)}–идёт`).click();

  const form = dialog(page, "Сессия");
  await expect(field(form, "Конец")).toHaveValue("");
  await expect(textOf(form, RUNNING_END_HINT)).toBeVisible();
  await expect(field(form, "Заметка")).toHaveAttribute("placeholder", "Что сделано");
});

test("42. в «Сессия», открытом на странице этой задачи, ссылки «К задаче» нет", async ({
  page,
}) => {
  const anki = await createTask(page, { title: "Anki" });
  await startTimer(page, anki.id);
  await page.goto(`/tasks/${anki.id}`);

  await page.getByRole("button", { name: /^Изменить сессию / }).click();

  const form = dialog(page, "Сессия");
  await expect(field(form, "Начало")).toBeVisible();
  await expect(link(form, "К задаче")).toHaveCount(0);
});
