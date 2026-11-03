import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { checkConnection } from "../notion/connection-check.ts";
import { disconnect, findConnection, toNotionConnection } from "../notion/connections.ts";

export const notionConnection = new Hono<AuthedEnv>()
  .get("/", async (c) => {
    const connection = await findConnection(database(c.env), c.var.user.id);
    return c.json({ connection: connection === undefined ? null : toNotionConnection(connection) });
  })
  .delete("/", async (c) => {
    await disconnect(database(c.env), c.var.user.id);
    return c.body(null, 204);
  })
  .post("/check", async (c) => {
    return c.json({ connection: await checkConnection(c.env, c.var.user.id) });
  });
