import { and, eq, lte } from "drizzle-orm";
import { randomToken } from "../auth/tokens.ts";
import type { Database } from "../db/client.ts";
import { notionOauthStates } from "../db/schema.ts";

const CONNECT_STATE_LIFETIME_MS = 10 * 60_000;

export async function createConnectState(db: Database, userId: string, now: Date): Promise<string> {
  await db.delete(notionOauthStates).where(lte(notionOauthStates.expiresAt, now));
  const state = randomToken();
  await db.insert(notionOauthStates).values({
    state,
    userId,
    expiresAt: new Date(now.getTime() + CONNECT_STATE_LIFETIME_MS),
  });
  return state;
}

export async function consumeConnectState(
  db: Database,
  state: string,
  userId: string,
  now: Date,
): Promise<boolean> {
  const [consumed] = await db
    .delete(notionOauthStates)
    .where(and(eq(notionOauthStates.state, state), eq(notionOauthStates.userId, userId)))
    .returning();
  return consumed !== undefined && consumed.expiresAt > now;
}
