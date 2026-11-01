import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { getSession, stopSession } from "../timers/timers.ts";

export const timerSessions = new Hono<AuthedEnv>()
  .get("/:id", async (c) => {
    const session = await getSession(database(c.env), c.var.user.id, c.req.param("id"), c.var.now);
    return c.json({ session });
  })
  .post("/:id/stop", async (c) => {
    const session = await stopSession(database(c.env), c.var.user.id, c.req.param("id"), c.var.now);
    return c.json({ session });
  });
