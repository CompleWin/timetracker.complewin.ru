import { Hono } from "hono";
import type { AppEnv } from "../env.ts";

export const health = new Hono<AppEnv>().get("/health", (c) =>
  c.json({ status: "ok", env: c.env.ENV, botUsername: c.env.TG_BOT_USERNAME }),
);
