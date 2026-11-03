import { Hono } from "hono";
import { resumeSession } from "../auth/sessions.ts";
import type { AppEnv } from "../env.ts";
import {
  beginNotionConnect,
  completeNotionConnect,
  type ConnectOutcome,
} from "../notion/connect.ts";

const SIGN_IN_PATH = "/login?returnTo=/settings";

export const notionOauth = new Hono<AppEnv>()
  .get("/oauth/start", async (c) => {
    const user = await resumeSession(c);
    if (user === undefined) return c.redirect(SIGN_IN_PATH, 302);
    return c.redirect(await beginNotionConnect(c.env, user.id, c.var.now), 302);
  })
  .get("/oauth/callback", async (c) => {
    const user = await resumeSession(c);
    const outcome = await completeNotionConnect(c.env, {
      query: c.req.query(),
      user,
      now: c.var.now,
    });
    return c.redirect(settingsPath(outcome), 302);
  });

function settingsPath(outcome: ConnectOutcome): string {
  return outcome === "connected"
    ? "/settings?notion=connected"
    : `/settings?notion_error=${outcome}`;
}
