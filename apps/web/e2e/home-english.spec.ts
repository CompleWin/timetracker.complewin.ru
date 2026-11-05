import { expect, test } from "@playwright/test";
import { createTask } from "./helpers/api.ts";
import { addLocalSession, afternoonZone, loginInZone } from "./helpers/afternoon.ts";
import { pickerTrigger } from "./helpers/picker.ts";
import { button, heading, island, textOf } from "./helpers/ui.ts";

const ZONE = afternoonZone();
const ENGLISH_TRIGGER = "What are you doing? Pick a task and the timer starts right away";

test.use({ timezoneId: ZONE.timezoneId });

test("44. пользователь с locale en видит главную на английском, при одной сегодняшней сессии «1 session»", async ({
  page,
}) => {
  await loginInZone(page, ZONE, { locale: "en" });
  const anki = await createTask(page, { title: "Anki" });
  await addLocalSession(page, ZONE, anki.id, { start: "10:00", end: "10:30" });

  await page.goto("/");

  await expect(pickerTrigger(page, ENGLISH_TRIGGER)).toBeVisible();
  await expect(button(page, "Add manually")).toBeVisible();
  await expect(heading(page, "Timeline")).toBeVisible();
  await expect(heading(page, "Today's summary")).toBeVisible();
  await expect(textOf(island(page, "Today's summary"), "1 session")).toBeVisible();
});
