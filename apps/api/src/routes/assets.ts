import type { Context } from "hono";
import type { AppEnv } from "../env.ts";
import { isAppPage, renderAppPage } from "./seo.ts";

export async function serveAssets(c: Context<AppEnv>): Promise<Response> {
  const { ASSETS } = c.env;
  const { method, url } = c.req;
  if (method !== "GET" && method !== "HEAD") {
    const asset = await ASSETS.fetch(c.req.raw);
    return new Response(asset.body, asset);
  }

  const path = new URL(url).pathname;
  const status = isAppPage(path) ? 200 : 404;
  if (status === 404) {
    const asset = await ASSETS.fetch(c.req.raw);
    if (asset.status !== 404) return new Response(asset.body, asset);
  }

  const shell = await ASSETS.fetch(new URL("/", url));
  if (!shell.ok) return new Response(shell.body, shell);
  return renderAppPage(c, shell, path, status);
}
