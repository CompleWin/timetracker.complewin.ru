import type { Bindings } from "./env.ts";

type CronJob = (env: Bindings, now: Date) => Promise<void>;

const jobs: CronJob[] = [];

export async function runCron(env: Bindings, now: Date): Promise<void> {
  for (const job of jobs) await job(env, now);
}
