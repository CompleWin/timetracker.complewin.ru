import { expect, test } from "@playwright/test";
import { activeTimers, createProject, createTask, startTimer } from "./helpers/api.ts";
import { afternoonZone, localTime, loginInZone } from "./helpers/afternoon.ts";
import { pickerTrigger } from "./helpers/picker.ts";
import { button, link, region, runningNow, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const ZONE = afternoonZone();
const ANY_RUNNING_REGION = /^Сейчас ид/;

test.use({ timezoneId: ZONE.timezoneId });

test.beforeEach(async ({ page }) => {
  await loginInZone(page, ZONE);
});

test("19. без идущих таймеров региона «Сейчас идёт» нет, триггер панели выбора и «Добавить вручную» видны", async ({
  page,
}) => {
  await createTask(page, { title: "Anki" });
  await page.goto("/");

  await expect(pickerTrigger(page)).toBeVisible();
  await expect(button(page, "Добавить вручную")).toBeVisible();
  await expect(page.getByRole("region", { name: ANY_RUNNING_REGION })).toHaveCount(0);
});

test("19. с одним идущим таймером кнопки «Остановить все» нет", async ({ page }) => {
  const anki = await createTask(page, { title: "Anki" });
  await startTimer(page, anki.id);
  await page.goto("/");

  await expect(link(runningNow(page), "Anki")).toBeVisible();
  await expect(button(page, "Остановить все")).toHaveCount(0);
});

test("20. два таймера стоят в регионе «Сейчас идут · 2» по порядку запуска, «Остановить все» останавливает оба", async ({
  page,
}) => {
  const treadmill = await createTask(page, { title: "Беговая дорожка" });
  const anki = await createTask(page, { title: "Anki" });
  await startTimer(page, treadmill.id);
  await startTimer(page, anki.id);
  await page.goto("/");

  const running = region(page, "Сейчас идут · 2");
  await expect(running.getByRole("link")).toHaveText(["Беговая дорожка", "Anki"]);

  await button(running, "Остановить все").click();

  await expect(page.getByRole("region", { name: ANY_RUNNING_REGION })).toHaveCount(0);
  await expect.poll(() => activeTimers(page)).toEqual([]);
});

test("21. в строке идущего таймера задачи проекта «Языки» видны «Языки» и «с <время запуска>», название ведёт на страницу задачи", async ({
  page,
}) => {
  const languages = await createProject(page, { name: "Языки" });
  const anki = await createTask(page, { title: "Anki", projectId: languages.id });
  const running = await startTimer(page, anki.id);
  await page.goto("/");

  const row = runningNow(page);
  await expect(textOf(row, "Языки")).toBeVisible();
  await expect(textOf(row, `с ${localTime(ZONE, running.startedAt)}`)).toBeVisible();

  await link(row, "Anki").click();

  await expect(page).toHaveURL(urlMatching(`/tasks/${anki.id}`));
});
