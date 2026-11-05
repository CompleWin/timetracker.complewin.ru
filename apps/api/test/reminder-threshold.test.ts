import { describe, expect, it } from "vitest";
import { expectValidationError } from "./harness/assertions.ts";
import { api } from "./harness/index.ts";
import { currentUser, loginAs } from "./harness/session.ts";

describe("reminderThresholdMin", () => {
  it("15. у нового пользователя reminderThresholdMin = 180", async () => {
    const { session } = await loginAs();

    expect(await currentUser(session)).toMatchObject({ reminderThresholdMin: 180 });
  });

  it.each([10, 14, 1441, 1500, 90.5, -60])(
    "15. значение %s даёт 400 с полем reminderThresholdMin",
    async (value) => {
      const { session } = await loginAs();

      const response = await api.patch("/api/me", { reminderThresholdMin: value }, { as: session });

      expectValidationError(response, ["reminderThresholdMin"]);
      expect(await currentUser(session)).toMatchObject({ reminderThresholdMin: 180 });
    },
  );

  it.each([0, 15, 60, 1440])("15. значение %s сохраняется", async (value) => {
    const { session } = await loginAs();

    const response = await api.patch("/api/me", { reminderThresholdMin: value }, { as: session });

    expect(response).toMatchObject({
      status: 200,
      body: { user: { reminderThresholdMin: value } },
    });
    expect(await currentUser(session)).toMatchObject({ reminderThresholdMin: value });
  });
});
