import { eq } from "drizzle-orm";
import { database, type Database } from "../db/client.ts";
import {
  notionConnections,
  notionDatabases,
  notionOauthStates,
  projects,
  sessions,
  syncOutbox,
  tasks,
  timeEntries,
  users,
} from "../db/schema.ts";
import type { Bindings } from "../env.ts";
import { findConnection } from "../notion/connections.ts";
import { revokeToken } from "../notion/oauth.ts";
import { decryptToken } from "../notion/token-cipher.ts";

export async function deleteAccount(env: Bindings, userId: string): Promise<void> {
  const db = database(env);
  await revokeNotionAccess(env, db, userId).catch(() => undefined);
  await deleteUserRows(db, userId);
}

async function revokeNotionAccess(env: Bindings, db: Database, userId: string): Promise<void> {
  const connection = await findConnection(db, userId);
  if (connection === undefined) return;
  const accessToken = await decryptToken(env.TOKEN_ENC_KEY, connection.accessTokenEnc);
  await revokeToken(env, accessToken);
}

async function deleteUserRows(db: Database, userId: string): Promise<void> {
  await db.batch([
    db.delete(timeEntries).where(eq(timeEntries.userId, userId)),
    db.delete(syncOutbox).where(eq(syncOutbox.userId, userId)),
    db.delete(tasks).where(eq(tasks.userId, userId)),
    db.delete(projects).where(eq(projects.userId, userId)),
    db.delete(notionDatabases).where(eq(notionDatabases.userId, userId)),
    db.delete(notionConnections).where(eq(notionConnections.userId, userId)),
    db.delete(notionOauthStates).where(eq(notionOauthStates.userId, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ]);
}
