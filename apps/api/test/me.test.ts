import { describe, expect, it } from "vitest";
import { expectApiError, expectValidationError } from "./harness/assertions.ts";
import { api, type TestSession } from "./harness/index.ts";
import { loginAs } from "./harness/session.ts";

async function russianUserSession(): Promise<TestSession> {
  const { session } = await loginAs({}, { headers: { "Accept-Language": "ru-RU" } });
  return session;
}

describe("PATCH /api/me", () => {
  it("15. timezone Europe/Moscow сохраняется", async () => {
    const { session } = await loginAs();
    const response = await api.patch("/api/me", { timezone: "Europe/Moscow" }, { as: session });

    expect(response).toMatchObject({ status: 200, body: { user: { timezone: "Europe/Moscow" } } });
    expect(await api.get("/api/me", { as: session })).toMatchObject({
      status: 200,
      body: { user: { timezone: "Europe/Moscow" } },
    });
  });

  it("15. timezone Mars/Base даёт 400 с полем timezone", async () => {
    const { session } = await loginAs();
    const response = await api.patch("/api/me", { timezone: "Mars/Base" }, { as: session });

    expectValidationError(response, ["timezone"]);
  });

  it.each([{}, { nickname: "ivan" }])(
    "15. тело %j без известных полей даёт 400 validation_error",
    async (body) => {
      const { session } = await loginAs();

      expectApiError(await api.patch("/api/me", body, { as: session }), "validation_error");
    },
  );

  it("19. locale en сохраняется", async () => {
    const session = await russianUserSession();
    const response = await api.patch("/api/me", { locale: "en" }, { as: session });

    expect(response).toMatchObject({ status: 200, body: { user: { locale: "en" } } });
    expect(await api.get("/api/me", { as: session })).toMatchObject({
      status: 200,
      body: { user: { locale: "en" } },
    });
  });

  it("19. locale de даёт 400 с полем locale", async () => {
    const session = await russianUserSession();
    const response = await api.patch("/api/me", { locale: "de" }, { as: session });

    expectValidationError(response, ["locale"]);
  });
});
