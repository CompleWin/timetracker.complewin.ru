import type { Bindings } from "./env.ts";
import { pushNotionChanges } from "./sync/push.ts";

type CronJob = (env: Bindings, now: Date) => Promise<void>;

const jobs: CronJob[] = [pushNotionChanges];

export async function runCron(env: Bindings, now: Date): Promise<void> {
  for (const job of jobs) await job(env, now);
}
