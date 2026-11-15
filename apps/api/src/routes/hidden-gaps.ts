import { hideGapBody, periodQuery } from "@stt/shared";
import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { jsonBody, queryParams } from "../http/validation.ts";
import { hideGap, listHiddenGaps } from "../timers/hidden-gaps.ts";

export const hiddenGaps = new Hono<AuthedEnv>()
  .get("/", queryParams(periodQuery), async (c) => {
    const gaps = await listHiddenGaps(database(c.env), c.var.user.id, c.req.valid("query"));
    return c.json({ hiddenGaps: gaps });
  })
  .post("/", jsonBody(hideGapBody), async (c) => {
    await hideGap(database(c.env), c.var.user.id, c.req.valid("json"));
    return c.body(null, 204);
  });
