import { expect, test, type Page } from "@playwright/test";
import { accountMenu, openAccountMenu } from "./helpers/account-menu.ts";
import { button, heading, pageTitle, textOf } from "./helpers/ui.ts";
import { urlMatching } from "./helpers/url.ts";

const signInErrors = [
  ["cancelled", "Вход отменён"],
  ["state", "Ссылка для входа устарела, попробуй ещё раз"],
  ["token", "Не удалось войти через Telegram"],
  ["unavailable", "Не удалось войти через Telegram"],
] as const;

function telegramLink(page: Page, name: string) {
  return page.getByRole("link", { name, exact: true });
}

test("20. открытие / без сессии показывает главную для гостя, а не ведёт на /login", async ({
  page,
}) => {
  await page.goto("/");

  await expect(pageTitle(page, "SimpleTimeTracker")).toBeVisible();
  await expect(page).toHaveURL(urlMatching("/"));
});

test("20. на /login ссылка «Войти через Telegram» указывает на /auth/telegram/start?returnTo=%2F", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(heading(page, "Вход")).toBeVisible();
  await expect(telegramLink(page, "Войти через Telegram")).toHaveAttribute(
    "href",
    "/auth/telegram/start?returnTo=%2F",
  );
});

test("20. /settings без сессии ведёт на /login?returnTo=/settings", async ({ page }) => {
  await page.goto("/settings");

  await expect(page).toHaveURL(urlMatching("/login", { returnTo: "/settings" }));
});

test("21. «Войти как тестовый пользователь» открывает главную, в меню «Меню» видны «Dev User» и «Выйти», «Выйти» ведёт на /login", async ({
  page,
}) => {
  await page.goto("/login");
  await button(page, "Войти как тестовый пользователь").click();

  await expect(page).toHaveURL(urlMatching("/"));
  await openAccountMenu(page);
  await expect(textOf(accountMenu(page), "Dev User")).toBeVisible();

  await button(accountMenu(page), "Выйти").click();

  await expect(page).toHaveURL(urlMatching("/login"));
  await page.goto("/settings");
  await expect(page).toHaveURL(urlMatching("/login"));
});

for (const [error, message] of signInErrors) {
  test(`22. /login?error=${error} показывает «${message}»`, async ({ page }) => {
    await page.goto(`/login?error=${error}`);

    await expect(page.getByText(message, { exact: true })).toBeVisible();
  });
}

test("23. на /login кнопка «English» переключает ссылку на «Sign in with Telegram», язык сохраняется после перезагрузки", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English", exact: true }).click();

  await expect(telegramLink(page, "Sign in with Telegram")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();

  await page.reload();

  await expect(telegramLink(page, "Sign in with Telegram")).toBeVisible();
});
