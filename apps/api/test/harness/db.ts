import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";

export const db = {
  async all<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<Row[]> {
    const { results } = await env.DB.prepare(sql)
      .bind(...params)
      .all<Row>();
    return results;
  },
};

export async function resetDatabase(): Promise<void> {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}
