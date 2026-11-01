import { describe, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api, type Opts, type TestResponse } from "./harness/index.ts";
import { loginAs } from "./harness/session.ts";

type UnknownApiRequest = [string, (opts?: Opts) => Promise<TestResponse>];

const unknownApiRequests: UnknownApiRequest[] = [
  ["GET /api/nope", (opts) => api.get("/api/nope", opts)],
  ["GET /api/nope/deeper", (opts) => api.get("/api/nope/deeper", opts)],
  ["POST /api/nope", (opts) => api.post("/api/nope", undefined, opts)],
  ["DELETE /api/nope", (opts) => api.delete("/api/nope", opts)],
];

describe("неизвестные маршруты /api", () => {
  it.each(unknownApiRequests)(
    "3. %s с сессией отвечает 404 not_found с непустым message",
    async (_, send) => {
      const { session } = await loginAs();

      expectApiError(await send({ as: session }), "not_found");
    },
  );

  it.each(unknownApiRequests)("3. %s без сессии отвечает 401 unauthorized", async (_, send) => {
    expectApiError(await send(), "unauthorized");
  });
});
