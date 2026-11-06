import { Hono } from "hono";
import type { AuthedEnv } from "../env.ts";
import {
  describeDatabaseProperties,
  listAvailableDatabases,
} from "../notion/available-databases.ts";

export const notionAvailableDatabases = new Hono<AuthedEnv>()
  .get("/", async (c) => {
    return c.json({ databases: await listAvailableDatabases(c.env, c.var.user.id) });
  })
  .get("/:dataSourceId/properties", async (c) => {
    const dataSourceId = c.req.param("dataSourceId");
    return c.json(await describeDatabaseProperties(c.env, c.var.user.id, dataSourceId));
  });
