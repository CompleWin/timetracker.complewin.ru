import type { Context } from "hono";
import type { AppEnv } from "../env.ts";

export async function serveAssets(c: Context<AppEnv>): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(asset.body, asset);
}
