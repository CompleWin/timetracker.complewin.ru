import { expect, test } from "@playwright/test";
import { createTask } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { openTaskPage } from "./helpers/task-page.ts";
import { heading, textOf } from "./helpers/ui.ts";

test("19. пользователь с locale en видит на странице задачи без сессий «Never started» и «By day», на пустом /archive «No archived projects»", async ({
  page,
}) => {
  await loginAs(page, { locale: "en" });
  const anki = await createTask(page, { title: "Anki" });

  await openTaskPage(page, anki);

  await expect(textOf(page, "Never started")).toBeVisible();
  await expect(heading(page, "By day")).toBeVisible();

  await page.goto("/archive");

  await expect(textOf(page, "No archived projects")).toBeVisible();
});
