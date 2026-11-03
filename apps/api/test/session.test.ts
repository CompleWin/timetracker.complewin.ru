import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api, type TestResponse, type TestSession } from "./harness/index.ts";
import { expectSessionCookie, loginAs, sessionFrom, sessionSetCookie } from "./harness/session.ts";
import { tablesContaining } from "./harness/storage.ts";
import { fakeTelegram, telegramProfile } from "./harness/telegram.ts";

const LOGGED_IN_AT = "2030-01-01T00:00:00.000Z";
const DAY_MS = 86_400_000;
const EVIL_ORIGIN = { Origin: "https://evil.example" };

function sessionDay(day: number): string {
  return new Date(Date.parse(LOGGED_IN_AT) + day * DAY_MS).toISOString();
}

async function loginOnDayZero(): Promise<TestSession> {
  const { session } = await loginAs({}, { now: LOGGED_IN_AT });
  return session;
}

function meOnDay(session: TestSession, day: number): Promise<TestResponse> {
  return api.get("/api/me", { as: session, now: sessionDay(day) });
}

function logout(session?: TestSession): Promise<TestResponse> {
  return api.post("/auth/logout", undefined, { as: session });
}

describe("без сессии", () => {
  it("11. GET /api/me без cookie возвращает 401 unauthorized", async () => {
    expectApiError(await api.get("/api/me"), "unauthorized");
  });

  it("11. GET /api/me с неизвестной cookie возвращает 401 unauthorized", async () => {
    const response = await api.get("/api/me", { as: { cookie: "unknown-session-token" } });

    expectApiError(response, "unauthorized");
  });

  it("11. PATCH /api/me без cookie возвращает 401 unauthorized", async () => {
    expectApiError(await api.patch("/api/me", { locale: "en" }), "unauthorized");
  });
});

describe("POST /auth/logout", () => {
  it("12. после logout (204) старая cookie даёт 401", async () => {
    const { session } = await loginAs();

    expect(await logout(session)).toMatchObject({ status: 204, body: null });
    expectApiError(await api.get("/api/me", { as: session }), "unauthorized");
  });

  it("12. logout сбрасывает cookie: stt_session=; Max-Age=0; Path=/", async () => {
    const { session } = await loginAs();

    expect(sessionSetCookie(await logout(session))).toMatchObject({
      value: "",
      attributes: { "max-age": "0", path: "/" },
    });
  });

  it("12. logout без сессии отвечает 204", async () => {
    expect(await logout()).toMatchObject({ status: 204, body: null });
  });

  it("17. logout с Origin https://evil.example возвращает 403 и сессию не удаляет", async () => {
    const { session } = await loginAs();
    const response = await api.post("/auth/logout", undefined, {
      as: session,
      headers: EVIL_ORIGIN,
    });

    expectApiError(response, "forbidden");
    expect(await api.get("/api/me", { as: session })).toMatchObject({ status: 200 });
  });
});

describe("сроки сессии", () => {
  it("13. запрос через 29 дней после входа проходит", async () => {
    const session = await loginOnDayZero();

    expect(await meOnDay(session, 29)).toMatchObject({ status: 200 });
  });

  it("13. запрос через 31 день без активности даёт 401", async () => {
    const session = await loginOnDayZero();

    expectApiError(await meOnDay(session, 31), "unauthorized");
  });

  it("13. запрос на 20-й день продлевает сессию: новый Set-Cookie, и запрос на 45-й день проходит", async () => {
    const session = await loginOnDayZero();
    const renewal = await meOnDay(session, 20);

    expect(renewal).toMatchObject({ status: 200 });
    expectSessionCookie(renewal);
    expect(await meOnDay(sessionFrom(renewal), 45)).toMatchObject({ status: 200 });
  });

  it("13. запрос на 10-й день не продлевает сессию: запрос на 31-й день даёт 401", async () => {
    const session = await loginOnDayZero();

    expect(await meOnDay(session, 10)).toMatchObject({ status: 200 });
    expectApiError(await meOnDay(session, 31), "unauthorized");
  });

  it("13. истёкшая сессия удаляется и не работает даже при более раннем X-Test-Now", async () => {
    const session = await loginOnDayZero();

    expectApiError(await meOnDay(session, 31), "unauthorized");
    expectApiError(await meOnDay(session, 29), "unauthorized");
  });
});

describe("хранение токена", () => {
  it("14. сырой токен сессии не встречается ни в одной таблице D1", async () => {
    const telegram = await fakeTelegram();
    const telegramSession = sessionFrom(await telegram.login());
    const { session: devSession } = await loginAs({ telegramId: 2 });

    expect(await tablesContaining(telegramProfile.username)).not.toEqual([]);
    expect(await tablesContaining(telegramSession.cookie)).toEqual([]);
    expect(await tablesContaining(devSession.cookie)).toEqual([]);
  });
});
