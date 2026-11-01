import { describe, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api, type TestResponse } from "./harness/index.ts";

const unknownApiRequests: [string, () => Promise<TestResponse>][] = [
  ["GET /api/nope", () => api.get("/api/nope")],
  ["GET /api/nope/deeper", () => api.get("/api/nope/deeper")],
  ["POST /api/nope", () => api.post("/api/nope")],
  ["DELETE /api/nope", () => api.delete("/api/nope")],
];

describe("неизвестные маршруты /api", () => {
  it.each(unknownApiRequests)(
    "3. %s отвечает 404 not_found с непустым message",
    async (_, send) => {
      expectApiError(await send(), "not_found");
    },
  );
});
