import { beforeEach, describe, expect, it } from "vitest";
import { sha256Base64url } from "./harness/encoding.ts";
import { testEnv, type ExternalCall } from "./harness/index.ts";
import { expectRedirect } from "./harness/redirect.ts";
import {
  currentUser,
  expectSessionCookie,
  sessionFrom,
  UUID,
  type TestUser,
} from "./harness/session.ts";
import {
  fakeTelegram,
  telegramProfile,
  type Claims,
  type FakeTelegram,
  type TokenReply,
} from "./harness/telegram.ts";

const RUSSIAN_FIRST = "ru-RU,ru;q=0.9,en;q=0.8";
const ENGLISH_FIRST = "en-US,ru;q=0.5";

const claimVariants: [string, Claims, Partial<TestUser>][] = [
  ["telegramId берётся из claim id, а не из sub", { id: 3003, sub: "4004" }, { telegramId: 3003 }],
  [
    "без id telegramId берётся из числового sub",
    { id: undefined, sub: "4004" },
    { telegramId: 4004 },
  ],
  [
    "без name имя складывается из given_name и family_name через пробел",
    { name: undefined, given_name: "Иван", family_name: "Петров" },
    { name: "Иван Петров" },
  ],
  [
    "без name, given_name и family_name имя берётся из preferred_username",
    { name: undefined },
    { name: telegramProfile.username },
  ],
  [
    "без name и preferred_username имя «Telegram user», а username = null",
    { name: undefined, preferred_username: undefined },
    { name: "Telegram user", username: null },
  ],
  ["без picture photoUrl = null", { picture: undefined }, { photoUrl: null }],
];

let telegram: FakeTelegram;

beforeEach(async () => {
  telegram = await fakeTelegram();
});

async function userAfterLogin(reply?: TokenReply, acceptLanguage?: string): Promise<TestUser> {
  const headers: Record<string, string> =
    acceptLanguage === undefined ? {} : { "Accept-Language": acceptLanguage };
  return currentUser(sessionFrom(await telegram.login(reply, { headers })));
}

function onlyTokenRequest(): ExternalCall {
  const [request, ...others] = telegram.tokenRequests();
  expect(others).toEqual([]);
  if (request === undefined) throw new Error("Token endpoint was not called");
  return request;
}

function formOf(call: ExternalCall): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(call.body));
}

function basicAuth(user: string, password: string): string {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

describe("успешный вход через Telegram", () => {
  it("3. callback отвечает 302 на returnTo и выставляет cookie со всеми атрибутами", async () => {
    const response = await telegram.callback(await telegram.start("/tasks/1"));

    expectRedirect(response, "/tasks/1");
    expectSessionCookie(response);
  });

  it("3. GET /api/me возвращает пользователя с данными из claims", async () => {
    const user = await userAfterLogin();

    expect(user).toMatchObject({ id: expect.stringMatching(UUID), ...telegramProfile });
  });

  it.each(claimVariants)("3. %s", async (_, claims, expected) => {
    const user = await userAfterLogin({ claims });

    expect(user).toMatchObject(expected);
  });
});

describe("обмен кода на токен", () => {
  it("4. запрос к token-эндпоинту содержит grant_type, code, redirect_uri, code_verifier и client_id", async () => {
    const attempt = await telegram.start();
    await telegram.callback(attempt);
    const request = onlyTokenRequest();

    expect(request.headers["content-type"]).toMatch(/^application\/x-www-form-urlencoded/);
    expect(formOf(request)).toMatchObject({
      grant_type: "authorization_code",
      code: attempt.code,
      redirect_uri: attempt.authorizationUrl.searchParams.get("redirect_uri"),
      code_verifier: expect.stringMatching(/^.{43,128}$/),
      client_id: testEnv.TG_CLIENT_ID,
    });
  });

  it("4. base64url(SHA-256(code_verifier)) равен code_challenge со старта", async () => {
    const attempt = await telegram.start();
    await telegram.callback(attempt);
    const verifier = formOf(onlyTokenRequest()).code_verifier ?? "";

    expect(await sha256Base64url(verifier)).toBe(
      attempt.authorizationUrl.searchParams.get("code_challenge"),
    );
  });

  it("4. клиент аутентифицируется через client_secret_basic", async () => {
    await telegram.login();

    expect(onlyTokenRequest().headers.authorization).toBe(
      basicAuth(testEnv.TG_CLIENT_ID, testEnv.TG_CLIENT_SECRET),
    );
  });
});

describe("повторный вход", () => {
  it("9. тот же telegramId возвращает того же пользователя с обновлёнными данными", async () => {
    const first = await userAfterLogin({ claims: { name: "Ivan" } });
    const updatedProfile = {
      name: "Ivan Sidorov",
      preferred_username: "sidorov",
      picture: "https://t.me/i/userpic/320/sidorov.jpg",
    };
    const second = await userAfterLogin({ claims: updatedProfile });

    expect(second).toMatchObject({
      id: first.id,
      telegramId: telegramProfile.telegramId,
      name: "Ivan Sidorov",
      username: "sidorov",
      photoUrl: "https://t.me/i/userpic/320/sidorov.jpg",
    });
  });
});

describe("botCanMessage", () => {
  it("10. scope ответа с telegram:bot_access даёт botCanMessage = true", async () => {
    const user = await userAfterLogin({ scope: "openid profile telegram:bot_access" });

    expect(user).toMatchObject({ botCanMessage: true });
  });

  it("10. scope без telegram:bot_access даёт новому пользователю botCanMessage = false", async () => {
    const user = await userAfterLogin({ scope: "openid profile" });

    expect(user).toMatchObject({ botCanMessage: false });
  });

  it("10. вход без telegram:bot_access не сбрасывает botCanMessage = true", async () => {
    await userAfterLogin({ scope: "openid profile telegram:bot_access" });
    const user = await userAfterLogin({ scope: "openid profile" });

    expect(user).toMatchObject({ botCanMessage: true });
  });
});

describe("язык нового пользователя", () => {
  it.each([
    [RUSSIAN_FIRST, "ru"],
    [ENGLISH_FIRST, "en"],
  ])("18. callback с Accept-Language %s даёт locale = %s", async (acceptLanguage, locale) => {
    const user = await userAfterLogin({}, acceptLanguage);

    expect(user).toMatchObject({ locale });
  });

  it("18. callback без Accept-Language даёт locale = en", async () => {
    const user = await userAfterLogin();

    expect(user).toMatchObject({ locale: "en" });
  });

  it("18. повторный вход с другим Accept-Language язык не меняет", async () => {
    await userAfterLogin({}, RUSSIAN_FIRST);
    const user = await userAfterLogin({}, ENGLISH_FIRST);

    expect(user).toMatchObject({ locale: "ru" });
  });
});
