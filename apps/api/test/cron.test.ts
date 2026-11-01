import { describe, expect, it } from "vitest";
import { api } from "./harness/index.ts";

describe("POST /__test/cron", () => {
  it("7. отвечает 204 без тела", async () => {
    const response = await api.post("/__test/cron");

    expect(response).toMatchObject({ status: 204, body: null });
  });

  it("7. с X-Test-Now отвечает 204", async () => {
    const response = await api.post("/__test/cron", undefined, { now: "2030-01-01T00:00:00Z" });

    expect(response).toMatchObject({ status: 204, body: null });
  });
});
