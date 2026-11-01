import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api, testEnv, type Opts } from "./harness/index.ts";

const foreignOrigins = [
  "https://evil.example",
  "http://stt.test",
  "https://stt.test.evil.example",
  "null",
];

function withOrigin(origin: string): Opts {
  return { headers: { Origin: origin } };
}

describe("проверка Origin", () => {
  it.each(foreignOrigins)(
    "7. POST /__test/cron с Origin %s получает 403 forbidden",
    async (origin) => {
      const response = await api.post("/__test/cron", undefined, withOrigin(origin));

      expectApiError(response, "forbidden");
    },
  );

  it("7. POST /__test/cron с Origin, равным APP_URL, получает 204", async () => {
    const response = await api.post("/__test/cron", undefined, withOrigin(testEnv.APP_URL));

    expect(response.status).toBe(204);
  });

  it("7. GET с чужим Origin не блокируется", async () => {
    const response = await api.get("/api/health", withOrigin("https://evil.example"));

    expect(response.status).toBe(200);
  });
});
