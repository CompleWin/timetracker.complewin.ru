import { expect, test, type Locator, type Page } from "@playwright/test";
import { botUsername, currentUser } from "./helpers/api.ts";
import { loginAs } from "./helpers/auth.ts";
import { chooseRadio, expectInSection, group, link, textOf } from "./helpers/ui.ts";

const SECTION = "Telegram-бот";

function reminderThresholds(page: Page): Locator {
  return group(page, "Напоминать, если таймер идёт дольше");
}

function thresholdRadio(page: Page, label: string): Locator {
  return reminderThresholds(page).getByRole("radio", { name: label, exact: true });
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
});

test("25. при botCanMessage = false в разделе «Telegram-бот» видна ссылка «Открыть @<botUsername>» на бота", async ({
  page,
}) => {
  const username = await botUsername(page);
  expect(username).toMatch(/\S/);
  await page.goto("/settings");

  const openBot = link(page, `Открыть @${username}`);
  const hint = textOf(page, "Открой бота и нажми Start, чтобы получать напоминания");
  await expect(openBot).toHaveAttribute("href", `https://t.me/${username}`);
  await expect(hint).toBeVisible();
  await expectInSection(page, SECTION, openBot);
  await expectInSection(page, SECTION, hint);
});

test("26. выбор «1 ч» в «Напоминать, если таймер идёт дольше» сохраняется и остаётся выбранным после перезагрузки", async ({
  page,
}) => {
  await page.goto("/settings");

  await chooseRadio(reminderThresholds(page), "1 ч");

  await expect.poll(async () => (await currentUser(page)).reminderThresholdMin).toBe(60);
  await page.reload();
  await expect(thresholdRadio(page, "1 ч")).toBeChecked();
});

test("27. у нового пользователя выбран «3 ч» и под чипами пояснение про 3 ч, после «Не напоминать» пояснение про ночь", async ({
  page,
}) => {
  await page.goto("/settings");

  await expect(thresholdRadio(page, "3 ч")).toBeChecked();
  await expect(
    textOf(page, "Если таймер идёт дольше 3 ч, бот спросит, не забыл ли ты его остановить"),
  ).toBeVisible();

  await chooseRadio(reminderThresholds(page), "Не напоминать");

  await expect(textOf(page, "Бот молчит, даже если таймер забыт на ночь")).toBeVisible();
  await expectInSection(page, SECTION, reminderThresholds(page));
});
