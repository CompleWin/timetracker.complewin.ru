import { createProjectBody, projectListQuery, updateProjectBody } from "@stt/shared";
import { Hono } from "hono";
import { database } from "../db/client.ts";
import type { AuthedEnv } from "../env.ts";
import { jsonBody, queryParams } from "../http/validation.ts";
import { createProject, getProject, listProjects, updateProject } from "../projects/projects.ts";

export const projects = new Hono<AuthedEnv>()
  .get("/", queryParams(projectListQuery), async (c) => {
    const { archived } = c.req.valid("query");
    return c.json({ projects: await listProjects(database(c.env), c.var.user.id, archived) });
  })
  .post("/", jsonBody(createProjectBody), async (c) => {
    const project = await createProject(
      database(c.env),
      c.var.user.id,
      c.req.valid("json"),
      c.var.now,
    );
    return c.json({ project }, 201);
  })
  .get("/:id", async (c) => {
    return c.json({ project: await getProject(database(c.env), c.var.user.id, c.req.param("id")) });
  })
  .patch("/:id", jsonBody(updateProjectBody), async (c) => {
    const project = await updateProject(
      database(c.env),
      c.var.user.id,
      c.req.param("id"),
      c.req.valid("json"),
      c.var.now,
    );
    return c.json({ project });
  });
