import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { listActiveSessions } from "../timers/timers.ts";

export const timers = new Hono<AuthedEnv>().get("/active", async (c) => {
  const sessions = await listActiveSessions(database(c.env), c.var.user.id, c.var.now);
  return c.json({ sessions });
});
