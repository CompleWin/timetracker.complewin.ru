import { expect } from "vitest";
import type { TestResponse } from "./api.ts";
import { testEnv } from "./test-env.ts";

export function redirectTarget(response: TestResponse): string | null {
  const location = response.headers.get("Location");
  if (location === null) return null;
  const url = new URL(location, testEnv.APP_URL);
  return url.origin === testEnv.APP_URL ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

export function expectRedirect(response: TestResponse, target: string): void {
  expect({ status: response.status, target: redirectTarget(response) }).toMatchObject({
    status: 302,
    target,
  });
}
