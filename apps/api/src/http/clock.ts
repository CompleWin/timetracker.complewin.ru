import { isoDateTime } from "@stt/shared";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env.ts";
import { validationError } from "./errors.ts";

const TEST_NOW_HEADER = "X-Test-Now";
const SERVER_NOW_HEADER = "X-Server-Now";

export const serverClock = createMiddleware<AppEnv>(async (c, next) => {
  c.set("now", new Date());
  await next();
  c.res.headers.set(SERVER_NOW_HEADER, c.var.now.toISOString());
});

export const testClock = createMiddleware<AppEnv>(async (c, next) => {
  const testNow = c.req.header(TEST_NOW_HEADER);
  if (c.env.ENV === "test" && testNow !== undefined) c.set("now", parseTestNow(testNow));
  await next();
});

function parseTestNow(value: string): Date {
  const parsed = isoDateTime.safeParse(value);
  if (!parsed.success) {
    throw validationError({ [TEST_NOW_HEADER]: "Expected ISO 8601 date-time with offset" });
  }
  return new Date(parsed.data);
}
