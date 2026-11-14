import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { notFound, unauthorized, validationError } from "../http/errors.ts";
import { hasValidSignature } from "../notion/webhook-signature.ts";
import {
  handledEventTypes,
  notionEvent,
  verificationRequest,
  type NotionEvent,
} from "../notion/webhook-events.ts";
import { deliverNotionEvent } from "../sync/webhook-delivery.ts";

const SIGNATURE_HEADER = "X-Notion-Signature";

export const notionWebhook = new Hono<AppEnv>().post("/webhook", async (c) => {
  const body = new Uint8Array(await c.req.arrayBuffer());
  const payload = parseJson(body);
  const verification = verificationRequest.safeParse(payload);
  if (verification.success) {
    console.log(`Notion webhook verification token: ${verification.data.verification_token}`);
    return c.json({ ok: true });
  }
  const secret = c.env.NOTION_WEBHOOK_SECRET;
  if (secret === undefined || secret === "") throw notFound();
  if (!(await hasValidSignature(secret, body, c.req.header(SIGNATURE_HEADER)))) {
    throw unauthorized();
  }
  const event = notionEvent.safeParse(payload);
  if (!event.success) throw validationError({ body: "Expected a Notion webhook event" });
  if (isHandled(event.data)) await deliverNotionEvent(c.env, event.data, c.var.now);
  return c.json({ ok: true });
});

function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined;
  }
}

function isHandled(event: NotionEvent): boolean {
  return event.entity.type === "page" && handledEventTypes.has(event.type);
}
