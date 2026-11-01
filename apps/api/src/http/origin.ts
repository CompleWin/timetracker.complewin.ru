import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env.ts";
import { forbidden } from "./errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

export const sameOriginWrites = createMiddleware<AppEnv>(async (c, next) => {
  const origin = c.req.header("Origin");
  const isWrite = !SAFE_METHODS.has(c.req.method);
  if (isWrite && origin !== undefined && origin !== new URL(c.env.APP_URL).origin) {
    throw forbidden();
  }
  await next();
});
