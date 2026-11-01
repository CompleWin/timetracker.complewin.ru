import { devLoginBody } from "@stt/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { devLogin } from "../auth/dev-login.ts";
import { endSession, startSession } from "../auth/sessions.ts";
import {
  beginTelegramLogin,
  completeTelegramLogin,
  SignInFailure,
} from "../auth/telegram-login.ts";
import type { AppEnv } from "../env.ts";
import { localeFromAcceptLanguage } from "../http/accept-language.ts";
import { notFound } from "../http/errors.ts";
import { jsonBody } from "../http/validation.ts";

const devOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENV !== "dev" && c.env.ENV !== "test") throw notFound();
  await next();
});

export const auth = new Hono<AppEnv>()
  .get("/telegram/start", async (c) => {
    try {
      return c.redirect(await beginTelegramLogin(c.env, c.req.query("returnTo"), c.var.now), 302);
    } catch (error) {
      return c.redirect(signInFailurePath(error), 302);
    }
  })
  .get("/telegram/callback", async (c) => {
    try {
      const { user, returnTo } = await completeTelegramLogin(c.env, {
        query: c.req.query(),
        locale: localeFromAcceptLanguage(c.req.header("Accept-Language")),
        now: c.var.now,
      });
      await startSession(c, user.id);
      return c.redirect(returnTo, 302);
    } catch (error) {
      return c.redirect(signInFailurePath(error), 302);
    }
  })
  .post("/dev-login", devOnly, jsonBody(devLoginBody), async (c) => {
    const locale = localeFromAcceptLanguage(c.req.header("Accept-Language"));
    const user = await devLogin(c.env, c.req.valid("json"), locale, c.var.now);
    await startSession(c, user.id);
    return c.json({ user });
  })
  .post("/logout", async (c) => {
    await endSession(c);
    return c.body(null, 204);
  });

function signInFailurePath(error: unknown): string {
  if (!(error instanceof SignInFailure)) throw error;
  return `/login?${new URLSearchParams({ error: error.reason })}`;
}
