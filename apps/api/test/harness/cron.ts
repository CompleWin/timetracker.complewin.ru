import { api } from "./api.ts";

export async function runCron(now?: string): Promise<void> {
  const response = await api.post("/__test/cron", undefined, { now });
  if (response.status !== 204) {
    throw new Error(
      `POST /__test/cron answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
}
