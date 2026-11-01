import type { User } from "@stt/shared";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { database, type Database } from "../db/client.ts";
import { sessions, users } from "../db/schema.ts";
import type { AppEnv } from "../env.ts";
import { toUser } from "../users/users.ts";
import { randomToken, sha256 } from "./tokens.ts";

const SESSION_COOKIE = "stt_session";
const DAY_MS = 86_400_000;
const SESSION_LIFETIME_MS = 30 * DAY_MS;
const RENEWAL_WINDOW_MS = 15 * DAY_MS;

export async function startSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken();
  await database(c.env)
    .insert(sessions)
    .values({
      id: await sha256(token),
      userId,
      createdAt: c.var.now,
      expiresAt: expiryFrom(c.var.now),
      userAgent: c.req.header("User-Agent") ?? null,
    });
  setSessionCookie(c, token);
}

export async function resumeSession<E extends AppEnv>(c: Context<E>): Promise<User | undefined> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token === undefined) return undefined;
  const db = database(c.env);
  const id = await sha256(token);
  const found = await findSession(db, id);
  if (found === undefined) return undefined;
  const msLeft = found.expiresAt.getTime() - c.var.now.getTime();
  if (msLeft <= 0) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return undefined;
  }
  if (msLeft < RENEWAL_WINDOW_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: expiryFrom(c.var.now) })
      .where(eq(sessions.id, id));
    setSessionCookie(c, token);
  }
  return found.user;
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = deleteCookie(c, SESSION_COOKIE, { path: "/" });
  if (token === undefined) return;
  await database(c.env)
    .delete(sessions)
    .where(eq(sessions.id, await sha256(token)));
}

async function findSession(
  db: Database,
  id: string,
): Promise<{ expiresAt: Date; user: User } | undefined> {
  const [row] = await db
    .select({ expiresAt: sessions.expiresAt, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));
  return row && { expiresAt: row.expiresAt, user: toUser(row.user) };
}

function setSessionCookie<E extends AppEnv>(c: Context<E>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_LIFETIME_MS / 1000,
  });
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + SESSION_LIFETIME_MS);
}
