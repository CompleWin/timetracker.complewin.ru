import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Environment } from "../env.ts";
import { rateLimited } from "./errors.ts";

const UNLIMITED_ENVIRONMENTS: Environment[] = ["dev", "test"];

export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limiter = c.env.API_RATE_LIMITER;
  if (limiter !== undefined && !UNLIMITED_ENVIRONMENTS.includes(c.env.ENV)) {
    const { success } = await limiter.limit({ key: rateLimitKey(c) });
    if (!success) throw rateLimited();
  }
  await next();
});

function rateLimitKey(c: Context<AppEnv>): string {
  const user = c.var.sessionUser;
  if (user !== undefined) return `user:${user.id}`;
  return `ip:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;
}
