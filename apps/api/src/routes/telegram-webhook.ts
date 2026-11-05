import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { unauthorized } from "../http/errors.ts";
import { handleUpdate } from "../telegram/webhook.ts";

const SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

export const telegramWebhook = new Hono<AppEnv>().post("/webhook", async (c) => {
  if (c.req.header(SECRET_HEADER) !== c.env.TG_WEBHOOK_SECRET) throw unauthorized();
  try {
    await handleUpdate(c.env, await c.req.json(), c.var.now);
  } catch (error) {
    console.error("Telegram update failed:", error);
  }
  return c.body(null, 200);
});
