import { describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import { api, type Opts, type TestResponse } from "./harness/index.ts";
import { currentUser, expectSessionCookie, sessionFrom, UUID } from "./harness/session.ts";

function devLogin(body: Record<string, unknown>, opts?: Opts): Promise<TestResponse> {
  return api.post("/auth/dev-login", body, opts);
}

function withAcceptLanguage(acceptLanguage: string): Opts {
  return { headers: { "Accept-Language": acceptLanguage } };
}

describe("POST /auth/dev-login", () => {
  it("16. создаёт пользователя с переданным telegramId и возвращает cookie сессии", async () => {
    const response = await devLogin({ telegramId: 4242 });

    expect(response).toMatchObject({
      status: 200,
      body: { user: { id: expect.stringMatching(UUID), telegramId: 4242 } },
    });
    expectSessionCookie(response);
  });

  it("16. cookie из dev-login открывает GET /api/me этого пользователя", async () => {
    const response = await devLogin({ telegramId: 4242 });
    const user = await currentUser(sessionFrom(response));

    expect(user).toMatchObject({ id: response.body.user.id, telegramId: 4242 });
  });

  it("16. без полей входит как telegramId 1 с именем «Dev User» и username = null", async () => {
    const response = await devLogin({});

    expect(response).toMatchObject({
      status: 200,
      body: { user: { telegramId: 1, name: "Dev User", username: null } },
    });
  });

  it("16. переданные name, username и locale сохраняются", async () => {
    const response = await devLogin({
      telegramId: 7,
      name: "Мария",
      username: "maria",
      locale: "ru",
    });

    expect(response).toMatchObject({
      status: 200,
      body: { user: { telegramId: 7, name: "Мария", username: "maria", locale: "ru" } },
    });
  });

  it("16. повторный dev-login с тем же telegramId возвращает того же пользователя с новым именем", async () => {
    const first = await devLogin({ telegramId: 7, name: "Мария" });
    const second = await devLogin({ telegramId: 7, name: "Мария Иванова" });

    expect(second).toMatchObject({
      status: 200,
      body: { user: { id: first.body.user.id, name: "Мария Иванова" } },
    });
  });

  it.each([0, -1, 1.5, "abc"])(
    "16. telegramId %j даёт 400 с полем telegramId",
    async (telegramId) => {
      expectValidationError(await devLogin({ telegramId }), ["telegramId"]);
    },
  );

  it("16. неизвестный locale даёт 400 с полем locale", async () => {
    expectValidationError(await devLogin({ locale: "de" }), ["locale"]);
  });

  it.each([
    ["ru-RU,ru;q=0.9,en;q=0.8", "ru"],
    ["en-US,ru;q=0.5", "en"],
  ])(
    "18. dev-login с Accept-Language %s создаёт пользователя с locale = %s",
    async (header, locale) => {
      const response = await devLogin({}, withAcceptLanguage(header));

      expect(response).toMatchObject({ status: 200, body: { user: { locale } } });
    },
  );

  it("18. dev-login без Accept-Language создаёт пользователя с locale = en", async () => {
    expect(await devLogin({})).toMatchObject({ status: 200, body: { user: { locale: "en" } } });
  });
});
