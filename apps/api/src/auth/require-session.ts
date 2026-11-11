import { createMiddleware } from "hono/factory";
import type { AppEnv, AuthedEnv } from "../env.ts";
import { unauthorized } from "../http/errors.ts";
import { resumeSession } from "./sessions.ts";

export const identifySession = createMiddleware<AppEnv>(async (c, next) => {
  const user = await resumeSession(c);
  if (user !== undefined) c.set("sessionUser", user);
  await next();
});

export const requireSession = createMiddleware<AuthedEnv>(async (c, next) => {
  const user = c.var.sessionUser;
  if (user === undefined) throw unauthorized();
  c.set("user", user);
  await next();
});
