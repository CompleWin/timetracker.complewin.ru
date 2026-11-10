import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { retryFailed } from "../sync/outbox.ts";
import { requireSyncConnection, syncStatus } from "../sync/status.ts";

export const notionSync = new Hono<AuthedEnv>()
  .get("/sync", async (c) => {
    const db = database(c.env);
    const connection = await requireSyncConnection(db, c.var.user.id);
    return c.json(await syncStatus(db, connection));
  })
  .post("/sync/retry", async (c) => {
    const db = database(c.env);
    await requireSyncConnection(db, c.var.user.id);
    await retryFailed(db, c.var.user.id, c.var.now);
    return c.body(null, 204);
  });
