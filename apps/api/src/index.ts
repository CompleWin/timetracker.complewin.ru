import { createApp } from "./app.ts";
import { runCron } from "./cron.ts";
import type { Bindings } from "./env.ts";

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runCron(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Bindings>;
