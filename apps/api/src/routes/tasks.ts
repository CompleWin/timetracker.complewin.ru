import { createTaskBody, taskListQuery, updateTaskBody } from "@stt/shared";
import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { jsonBody, queryParams } from "../http/validation.ts";
import { createTask, getTask, listTasks, updateTask } from "../tasks/tasks.ts";

export const tasks = new Hono<AuthedEnv>()
  .get("/", queryParams(taskListQuery), async (c) => {
    return c.json({ tasks: await listTasks(database(c.env), c.var.user.id, c.req.valid("query")) });
  })
  .post("/", jsonBody(createTaskBody), async (c) => {
    const task = await createTask(database(c.env), c.var.user.id, c.req.valid("json"), c.var.now);
    return c.json({ task }, 201);
  })
  .get("/:id", async (c) => {
    return c.json({ task: await getTask(database(c.env), c.var.user.id, c.req.param("id")) });
  })
  .patch("/:id", jsonBody(updateTaskBody), async (c) => {
    const task = await updateTask(
      database(c.env),
      c.var.user.id,
      c.req.param("id"),
      c.req.valid("json"),
      c.var.now,
    );
    return c.json({ task });
  });
