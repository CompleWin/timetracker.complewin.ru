import { randomInt } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export type DevUser = {
  telegramId: number;
  name: string;
};

export type UserLocale = "ru" | "en";

export type LoginOptions = Partial<DevUser> & { locale?: UserLocale; username?: string };

type DevLoginBody = DevUser & { locale: UserLocale; username?: string };

export function uniqueTelegramId(): number {
  return randomInt(1_000_000, 2 ** 47);
}

export async function loginAs(page: Page, options: LoginOptions = {}): Promise<DevUser> {
  const devUser = {
    telegramId: options.telegramId ?? uniqueTelegramId(),
    name: options.name ?? "Тестовый пользователь",
  };
  await page.goto("/login");
  const status = await page.evaluate(postDevLogin, {
    ...devUser,
    locale: options.locale ?? "ru",
    username: options.username,
  });
  expect(status, "POST /auth/dev-login").toBe(200);
  return devUser;
}

async function postDevLogin(body: DevLoginBody): Promise<number> {
  const response = await fetch("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.status;
}
