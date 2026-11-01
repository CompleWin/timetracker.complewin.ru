import { Hono } from "hono";
import type { AppEnv } from "./env.ts";
import { serverClock, testClock } from "./http/clock.ts";
import { handleError, notFound } from "./http/errors.ts";
import { sameOriginWrites } from "./http/origin.ts";
import { serveAssets } from "./routes/assets.ts";
import { health } from "./routes/health.ts";
import { testHooks } from "./routes/test-hooks.ts";

const WORKER_PREFIXES = ["/api", "/auth", "/notion", "/tg", "/__test"];

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(serverClock, testClock, sameOriginWrites);

  app.route("/api", health);
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
