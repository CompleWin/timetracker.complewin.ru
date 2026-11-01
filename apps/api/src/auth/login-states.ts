import { eq, lte } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { oauthStates } from "../db/schema.ts";
import { randomToken } from "./tokens.ts";

const LOGIN_STATE_LIFETIME_MS = 10 * 60_000;

export type LoginState = typeof oauthStates.$inferSelect;

export async function createLoginState(
  db: Database,
  returnTo: string,
  now: Date,
): Promise<LoginState> {
  await db.delete(oauthStates).where(lte(oauthStates.expiresAt, now));
  const [created] = await db
    .insert(oauthStates)
    .values({
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier: randomToken(),
      returnTo,
      expiresAt: new Date(now.getTime() + LOGIN_STATE_LIFETIME_MS),
    })
    .returning();
  if (created === undefined) throw new Error("Login state was not created");
  return created;
}

export async function consumeLoginState(
  db: Database,
  state: string,
  now: Date,
): Promise<LoginState | undefined> {
  const [consumed] = await db.delete(oauthStates).where(eq(oauthStates.state, state)).returning();
  return consumed !== undefined && consumed.expiresAt > now ? consumed : undefined;
}
