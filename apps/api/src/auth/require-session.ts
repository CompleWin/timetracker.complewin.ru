import { createMiddleware } from "hono/factory";
import type { AuthedEnv } from "../env.ts";
import { unauthorized } from "../http/errors.ts";
import { resumeSession } from "./sessions.ts";

export const requireSession = createMiddleware<AuthedEnv>(async (c, next) => {
  const user = await resumeSession(c);
  if (user === undefined) throw unauthorized();
  c.set("user", user);
  await next();
});
