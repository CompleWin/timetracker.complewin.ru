import { updateMeBody } from "@stt/shared";
import { Hono } from "hono";
import { clearSessionCookie } from "../auth/sessions.ts";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { jsonBody } from "../http/validation.ts";
import { deleteAccount } from "../users/account-deletion.ts";
import { updateUser } from "../users/users.ts";

export const me = new Hono<AuthedEnv>()
  .get("/", (c) => c.json({ user: c.var.user }))
  .patch("/", jsonBody(updateMeBody), async (c) => {
    const user = await updateUser(database(c.env), c.var.user.id, c.req.valid("json"));
    return c.json({ user });
  })
  .delete("/", async (c) => {
    await deleteAccount(c.env, c.var.user.id);
    clearSessionCookie(c);
    return c.body(null, 204);
  });
