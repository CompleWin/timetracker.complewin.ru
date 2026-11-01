import { beforeEach, describe, expect, it } from "vitest";
import { testEnv, type Opts, type TestResponse } from "./harness/index.ts";
import { expectRedirect } from "./harness/redirect.ts";
import { expectSessionCookie, loginAs } from "./harness/session.ts";
import {
  expectSignInError,
  fakeTelegram,
  secondsFromNow,
  TELEGRAM_KEY_ID,
  telegramProfile,
  type FakeTelegram,
  type TokenReply,
} from "./harness/telegram.ts";

const STARTED_AT = "2030-01-01T00:00:00.000Z";
const MINUTE_MS = 60_000;
const russianBrowser: Opts = { headers: { "Accept-Language": "ru-RU,ru;q=0.9" } };

const tokenViolations: [string, TokenReply][] = [
  ["подпись чужим ключом с kid ключа Telegram", { signingKey: "stranger", kid: TELEGRAM_KEY_ID }],
  ["подпись чужим ключом с незнакомым kid", { signingKey: "stranger" }],
  ["неверный aud", { claims: { aud: "another-client-id" } }],
  ["aud массивом без TG_CLIENT_ID", { claims: { aud: ["another-client-id"] } }],
  ["неверный iss", { claims: { iss: "https://evil.example" } }],
  ["истёкший exp", { claims: { exp: secondsFromNow(-60) } }],
  ["iat позже, чем сейчас + 60 с", { claims: { iat: secondsFromNow(600) } }],
  ["неверный nonce", { claims: { nonce: "another-nonce" } }],
  ["нет ни id, ни числового sub", { claims: { id: undefined, sub: "ivan_petrov" } }],
  ["telegramId не положительный", { claims: { id: -5, sub: "-5" } }],
  ["token-эндпоинт ответил не 2xx", { status: 400 }],
  ["в ответе token-эндпоинта нет id_token", { withoutIdToken: true }],
];

const acceptedTokens: [string, TokenReply][] = [
  [
    "aud массивом, содержащим TG_CLIENT_ID",
    { claims: { aud: ["another-client-id", testEnv.TG_CLIENT_ID] } },
  ],
  ["iat на 30 с позже, чем сейчас", { claims: { iat: secondsFromNow(30) } }],
];

let telegram: FakeTelegram;

beforeEach(async () => {
  telegram = await fakeTelegram();
});

function minutesAfterStart(minutes: number): string {
  return new Date(Date.parse(STARTED_AT) + minutes * MINUTE_MS).toISOString();
}

function expectSignedIn(response: TestResponse): void {
  expectRedirect(response, "/");
  expectSessionCookie(response);
}

async function expectNoUserWithTelegramId(telegramId: number): Promise<void> {
  const { user } = await loginAs({ telegramId });

  expect(user).toMatchObject({ name: "Dev User", locale: "en" });
}

describe("проверка state", () => {
  it("5. повторный callback с тем же state даёт error=state", async () => {
    const attempt = await telegram.start();

    expectSignedIn(await telegram.callback(attempt));
    expectSignInError(await telegram.callback(attempt), "state");
  });

  it("5. state гасится сразу, даже если обмен кода не удался", async () => {
    const attempt = await telegram.start();

    expectSignInError(await telegram.callback(attempt, { status: 400 }), "token");
    expectSignInError(await telegram.callback(attempt), "state");
  });

  it("5. неизвестный state даёт error=state", async () => {
    const attempt = await telegram.start();

    expectSignInError(await telegram.callback({ ...attempt, state: "unknown-state" }), "state");
  });

  it("6. callback через 11 минут после старта даёт error=state", async () => {
    const attempt = await telegram.start("/", { now: STARTED_AT });
    const response = await telegram.callback(attempt, {}, { now: minutesAfterStart(11) });

    expectSignInError(response, "state");
  });

  it("6. callback через 9 минут после старта проходит", async () => {
    const attempt = await telegram.start("/", { now: STARTED_AT });
    const response = await telegram.callback(attempt, {}, { now: minutesAfterStart(9) });

    expectSignedIn(response);
  });
});

describe("отмена входа", () => {
  it("7. error=access_denied даёт error=cancelled", async () => {
    const response = await telegram.cancel(await telegram.start());

    expectSignInError(response, "cancelled");
  });

  it("7. после отмены тот же state погашен", async () => {
    const attempt = await telegram.start();
    await telegram.cancel(attempt);

    expectSignInError(await telegram.callback(attempt), "state");
  });
});

describe("проверка id_token", () => {
  it.each(tokenViolations)(
    "8. %s: error=token, без cookie и без нового пользователя",
    async (_, reply) => {
      const response = await telegram.login(reply, russianBrowser);

      expectSignInError(response, "token");
      await expectNoUserWithTelegramId(telegramProfile.telegramId);
    },
  );

  it.each(acceptedTokens)("8. %s не считается нарушением", async (_, reply) => {
    expectSignedIn(await telegram.login(reply));
  });
});
