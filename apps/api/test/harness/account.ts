import { api, type TestResponse, type TestSession } from "./api.ts";
import { external, type ExternalCall } from "./external.ts";
import type { SessionOpts } from "./rest.ts";
import { tablesContaining } from "./storage.ts";
import { testEnv } from "./test-env.ts";

export type RevokeReply = number | "network";

export const NOTION_REVOKE_URL = `${testEnv.NOTION_API_BASE}/v1/oauth/revoke`;

export function deleteAccount(session: TestSession, opts: SessionOpts = {}): Promise<TestResponse> {
  return api.delete("/api/me", { ...opts, as: session });
}

export function answerNotionRevoke(reply: RevokeReply = 200): void {
  external.on("POST", NOTION_REVOKE_URL, () => {
    if (reply === "network") throw new TypeError("Network connection lost");
    return Response.json({}, { status: reply });
  });
}

export async function externalCallsDuring(action: () => Promise<unknown>): Promise<ExternalCall[]> {
  const earlierCount = external.calls().length;
  await action();
  return external.calls().slice(earlierCount);
}

export async function tablesMentioningUser(user: {
  id: string;
  telegramId: number;
}): Promise<string[]> {
  const byId = await tablesContaining(user.id);
  const byTelegramId = await tablesContaining(String(user.telegramId));
  return [...new Set([...byId, ...byTelegramId])];
}
