import { addNotionDatabaseBody, updateNotionDatabaseBody } from "@stt/shared";
import { Hono } from "hono";
import type { AuthedEnv } from "../env.ts";
import { jsonBody } from "../http/validation.ts";
import {
  addNotionDatabase,
  changeNotionDatabase,
  removeNotionDatabaseOf,
} from "../notion/database-setup.ts";

export const notionDatabases = new Hono<AuthedEnv>()
  .post("/", jsonBody(addNotionDatabaseBody), async (c) => {
    const database = await addNotionDatabase(c.env, c.var.user, c.req.valid("json"), c.var.now);
    return c.json({ database }, 201);
  })
  .patch("/:id", jsonBody(updateNotionDatabaseBody), async (c) => {
    const database = await changeNotionDatabase(
      c.env,
      c.var.user,
      c.req.param("id"),
      c.req.valid("json"),
    );
    return c.json({ database });
  })
  .delete("/:id", async (c) => {
    await removeNotionDatabaseOf(c.env, c.var.user.id, c.req.param("id"));
    return c.body(null, 204);
  });
