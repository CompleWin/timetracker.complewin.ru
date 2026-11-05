import { linkNotionPageBody, notionPageQuery } from "@stt/shared";
import { Hono } from "hono";
import type { AuthedEnv } from "../env.ts";
import { jsonBody, queryParams } from "../http/validation.ts";
import { linkNotionPage } from "../notion/page-link.ts";
import { searchNotionPages } from "../notion/page-search.ts";

export const notionPages = new Hono<AuthedEnv>()
  .get("/", queryParams(notionPageQuery), async (c) => {
    return c.json({ pages: await searchNotionPages(c.env, c.var.user, c.req.valid("query")) });
  })
  .post("/:pageId/link", jsonBody(linkNotionPageBody), async (c) => {
    const pageId = c.req.param("pageId");
    const task = await linkNotionPage(c.env, c.var.user, pageId, c.req.valid("json"), c.var.now);
    return c.json({ task }, 201);
  });
