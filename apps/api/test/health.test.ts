import { describe, expect, it } from "vitest";
import { api } from "./harness/index.ts";

describe("GET /api/health", () => {
  it('2. без сессии отвечает 200 { status: "ok", env: "test" }', async () => {
    const response = await api.get("/api/health");

    expect(response).toMatchObject({ status: 200, body: { status: "ok", env: "test" } });
  });
});
