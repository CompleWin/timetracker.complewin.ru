import {
  createSessionBody,
  createTaskBody,
  taskListQuery,
  taskSessionsQuery,
  updateTaskBody,
} from "@stt/shared";
import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { jsonBody, queryParams } from "../http/validation.ts";
import { createTask, getTask, listTasks, updateTask } from "../tasks/tasks.ts";
import { addSession } from "../timers/session-edits.ts";
import { listTaskSessions, startTimer, stopTaskTimer } from "../timers/timers.ts";

export const tasks = new Hono<AuthedEnv>()
  .get("/", queryParams(taskListQuery), async (c) => {
    const query = c.req.valid("query");
    return c.json({ tasks: await listTasks(database(c.env), c.var.user.id, query, c.var.now) });
  })
  .post("/", jsonBody(createTaskBody), async (c) => {
    const task = await createTask(database(c.env), c.var.user.id, c.req.valid("json"), c.var.now);
    return c.json({ task }, 201);
  })
  .get("/:id", async (c) => {
    const task = await getTask(database(c.env), c.var.user.id, c.req.param("id"), c.var.now);
    return c.json({ task });
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
  })
  .post("/:id/start", async (c) => {
    const session = await startTimer(database(c.env), c.var.user.id, c.req.param("id"), c.var.now);
    return c.json({ session }, 201);
  })
  .post("/:id/stop", async (c) => {
    const session = await stopTaskTimer(
      database(c.env),
      c.var.user.id,
      c.req.param("id"),
      c.var.now,
    );
    return c.json({ session });
  })
  .get("/:id/sessions", queryParams(taskSessionsQuery), async (c) => {
    const sessions = await listTaskSessions(
      database(c.env),
      c.var.user.id,
      c.req.param("id"),
      c.req.valid("query"),
      c.var.now,
    );
    return c.json({ sessions });
  })
  .post("/:id/sessions", jsonBody(createSessionBody), async (c) => {
    const session = await addSession(
      database(c.env),
      c.var.user.id,
      c.req.param("id"),
      c.req.valid("json"),
      c.var.now,
    );
    return c.json({ session }, 201);
  });
