import { describe, expect, it } from "vitest";
import { ISO_TIME, expectValidationError } from "./harness/assertions.ts";
import { api, type TestResponse } from "./harness/index.ts";

const MAX_DRIFT_MS = 5_000;
const pathsOfEveryKind = ["/api/health", "/api/nope", "/some/client/route"];

function serverNow(response: TestResponse): string {
  return response.headers.get("X-Server-Now") ?? "";
}

describe("X-Server-Now", () => {
  it.each(pathsOfEveryKind)(
    "4. ответ на %s содержит X-Server-Now в ISO в пределах 5 секунд от реального времени",
    async (path) => {
      const now = serverNow(await api.get(path));

      expect(now).toMatch(ISO_TIME);
      expect(Math.abs(Date.parse(now) - Date.now())).toBeLessThanOrEqual(MAX_DRIFT_MS);
    },
  );

  it("4. ответ 400 на неверный X-Test-Now тоже содержит X-Server-Now", async () => {
    const response = await api.get("/api/health", { now: "abc" });

    expect(serverNow(response)).toMatch(ISO_TIME);
  });
});

describe("X-Test-Now", () => {
  it.each(pathsOfEveryKind)("5. X-Test-Now задаёт X-Server-Now в ответе на %s", async (path) => {
    const response = await api.get(path, { now: "2030-01-01T00:00:00Z" });

    expect(serverNow(response)).toBe("2030-01-01T00:00:00.000Z");
  });

  it.each([
    ["2030-01-01T03:00:00+03:00", "2030-01-01T00:00:00.000Z"],
    ["2030-06-15T10:20:30.456Z", "2030-06-15T10:20:30.456Z"],
  ])("5. X-Test-Now %s нормализуется в X-Server-Now %s", async (testNow, expected) => {
    const response = await api.get("/api/health", { now: testNow });

    expect(serverNow(response)).toBe(expected);
  });

  it.each(["abc", "2030-13-01T00:00:00Z"])(
    "6. X-Test-Now %s даёт 400 validation_error с полем X-Test-Now",
    async (testNow) => {
      const response = await api.get("/api/health", { now: testNow });

      expectValidationError(response, ["X-Test-Now"]);
    },
  );
});
