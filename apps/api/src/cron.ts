import type { Bindings } from "./env.ts";
import { syncNotion } from "./sync/run.ts";

type CronJob = (env: Bindings, now: Date) => Promise<void>;

const jobs: CronJob[] = [syncNotion];

export async function runCron(env: Bindings, now: Date): Promise<void> {
  for (const job of jobs) await job(env, now);
}
