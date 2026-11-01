import { expect, test, type Page } from "@playwright/test";
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

test("20. открытие / без сессии ведёт на /login со ссылкой «Войти через Telegram»", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(urlMatching("/login", { returnTo: "/" }));
  await expect(page.getByRole("heading", { name: "Вход", exact: true })).toBeVisible();
  await expect(telegramLink(page, "Войти через Telegram")).toHaveAttribute(
    "href",
    "/auth/telegram/start?returnTo=%2F",
  );
});

test("21. «Войти как тестовый пользователь» открывает главную с «Dev User» и «Выйти», «Выйти» ведёт на /login", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Войти как тестовый пользователь" }).click();

  await expect(page).toHaveURL(urlMatching("/"));
  await expect(page.getByText("Dev User", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();

  await expect(page).toHaveURL(urlMatching("/login"));
  await page.goto("/");
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
