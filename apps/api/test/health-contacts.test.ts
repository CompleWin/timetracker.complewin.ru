import { describe, expect, it } from "vitest";
import { api } from "./harness/index.ts";

const NON_EMPTY = expect.stringMatching(/\S/);

describe("GET /api/health", () => {
  it("7. содержит непустые publisherName и supportEmail", async () => {
    const response = await api.get("/api/health");

    expect(response).toMatchObject({
      status: 200,
      body: { publisherName: NON_EMPTY, supportEmail: NON_EMPTY },
    });
  });
});
