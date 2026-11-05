import { sessionPeriodQuery, updateSessionBody } from "@stt/shared";
import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { jsonBody, queryParams } from "../http/validation.ts";
import { deleteSession, updateSession } from "../timers/session-edits.ts";
import { getSession, listPeriodSessions, stopSession } from "../timers/timers.ts";

export const timerSessions = new Hono<AuthedEnv>()
  .get("/", queryParams(sessionPeriodQuery), async (c) => {
    const query = c.req.valid("query");
    const db = database(c.env);
    return c.json({ sessions: await listPeriodSessions(db, c.var.user.id, query, c.var.now) });
  })
  .get("/:id", async (c) => {
    const session = await getSession(database(c.env), c.var.user.id, c.req.param("id"), c.var.now);
    return c.json({ session });
  })
  .patch("/:id", jsonBody(updateSessionBody), async (c) => {
    const session = await updateSession(
      database(c.env),
      c.var.user.id,
      c.req.param("id"),
      c.req.valid("json"),
      c.var.now,
    );
    return c.json({ session });
  })
  .delete("/:id", async (c) => {
    await deleteSession(database(c.env), c.var.user.id, c.req.param("id"), c.var.now);
    return c.body(null, 204);
  })
  .post("/:id/stop", async (c) => {
    const session = await stopSession(database(c.env), c.var.user.id, c.req.param("id"), c.var.now);
    return c.json({ session });
  });
