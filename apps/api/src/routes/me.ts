import { updateMeBody } from "@stt/shared";
import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { jsonBody } from "../http/validation.ts";
import { updateUser } from "../users/users.ts";

export const me = new Hono<AuthedEnv>()
  .get("/", (c) => c.json({ user: c.var.user }))
  .patch("/", jsonBody(updateMeBody), async (c) => {
    const user = await updateUser(database(c.env), c.var.user.id, c.req.valid("json"));
    return c.json({ user });
  });
