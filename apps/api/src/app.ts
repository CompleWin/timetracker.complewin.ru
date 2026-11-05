import { Hono } from "hono";
import { requireSession } from "./auth/require-session.ts";
import type { AppEnv } from "./env.ts";
import { serverClock, testClock } from "./http/clock.ts";
import { handleError, notFound } from "./http/errors.ts";
import { sameOriginWrites } from "./http/origin.ts";
import { serveAssets } from "./routes/assets.ts";
import { auth } from "./routes/auth.ts";
import { health } from "./routes/health.ts";
import { me } from "./routes/me.ts";
import { notionAvailableDatabases } from "./routes/notion-available-databases.ts";
import { notionConnection } from "./routes/notion-connection.ts";
import { notionDatabases } from "./routes/notion-databases.ts";
import { notionOauth } from "./routes/notion-oauth.ts";
import { notionSync } from "./routes/notion-sync.ts";
import { projects } from "./routes/projects.ts";
import { tasks } from "./routes/tasks.ts";
import { testHooks } from "./routes/test-hooks.ts";
import { timerSessions } from "./routes/timer-sessions.ts";
import { timers } from "./routes/timers.ts";

const WORKER_PREFIXES = ["/auth", "/notion", "/tg", "/__test"];

function apiRoutes() {
  return new Hono<AppEnv>()
    .route("/", health)
    .use(requireSession)
    .route("/me", me)
    .route("/projects", projects)
    .route("/tasks", tasks)
    .route("/sessions", timerSessions)
    .route("/timers", timers)
    .route("/notion/connection", notionConnection)
    .route("/notion/available-databases", notionAvailableDatabases)
    .route("/notion/databases", notionDatabases)
    .route("/notion", notionSync)
    .all("*", () => {
      throw notFound();
    });
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(serverClock, testClock, sameOriginWrites);

  app.route("/api", apiRoutes());
  app.route("/auth", auth);
  app.route("/notion", notionOauth);
  app.route("/__test", testHooks);

  for (const prefix of WORKER_PREFIXES) {
    app.all(`${prefix}/*`, () => {
      throw notFound();
    });
  }
  app.all("*", serveAssets);

  app.onError(handleError);
  return app;
}
