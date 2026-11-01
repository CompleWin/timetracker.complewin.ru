import { randomInt } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export type DevUser = {
  telegramId: number;
  name: string;
};

type DevLoginBody = DevUser & { locale: "ru" | "en" };

export function uniqueTelegramId(): number {
  return randomInt(1_000_000, 2 ** 47);
}

export async function loginAs(page: Page, user: Partial<DevUser> = {}): Promise<DevUser> {
  const devUser = {
    telegramId: user.telegramId ?? uniqueTelegramId(),
    name: user.name ?? "Тестовый пользователь",
  };
  await page.goto("/login");
  const status = await page.evaluate(postDevLogin, { ...devUser, locale: "ru" as const });
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
