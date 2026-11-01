import { Hono } from "hono";
import { runCron } from "../cron.ts";
import type { AppEnv } from "../env.ts";
import { notFound } from "../http/errors.ts";

export const testHooks = new Hono<AppEnv>()
  .use(async (c, next) => {
    if (c.env.ENV !== "test") throw notFound();
    await next();
  })
  .post("/cron", async (c) => {
    await runCron(c.env, c.var.now);
    return c.body(null, 204);
  });
