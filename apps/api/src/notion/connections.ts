import type { NotionConnection, NotionConnectionStatus } from "@stt/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { notionConnections } from "../db/schema.ts";
import { notFound, notionReauthRequired } from "../http/errors.ts";
import { listNotionDatabases } from "./databases.ts";
import type { NotionGrant, NotionTokens } from "./oauth.ts";
import { decryptToken, encryptToken } from "./token-cipher.ts";

type ConnectionRow = typeof notionConnections.$inferSelect;

export type ConnectedRow = ConnectionRow & { accessTokenEnc: string };

type EncryptedTokens = Pick<ConnectionRow, "accessTokenEnc" | "refreshTokenEnc">;

const NO_TOKENS: EncryptedTokens = { accessTokenEnc: null, refreshTokenEnc: null };

export async function saveConnection(
  db: Database,
  secret: string,
  userId: string,
  { tokens, workspace, botId, duplicatedTemplateId }: NotionGrant,
  now: Date,
): Promise<ConnectedRow> {
  const fields = {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceIcon: workspace.icon,
    botId,
    duplicatedTemplateId,
    ...(await encryptTokens(secret, tokens)),
    status: "ok" as const,
    createdAt: now,
  };
  const [row] = await db
    .insert(notionConnections)
    .values({ id: crypto.randomUUID(), userId, ...fields })
    .onConflictDoUpdate({ target: notionConnections.userId, set: fields })
    .returning();
  if (row === undefined || !isConnected(row)) throw new Error(`Notion connection was not saved`);
  return row;
}

export async function findWorkspaceId(db: Database, userId: string): Promise<string | undefined> {
  const row = await db.query.notionConnections.findFirst({
    columns: { workspaceId: true },
    where: eq(notionConnections.userId, userId),
  });
  return row?.workspaceId;
}

export async function findConnection(
  db: Database,
  userId: string,
): Promise<ConnectedRow | undefined> {
  const row = await db.query.notionConnections.findFirst({
    where: eq(notionConnections.userId, userId),
  });
  return row !== undefined && isConnected(row) ? row : undefined;
}

export async function requireConnection(db: Database, userId: string): Promise<ConnectedRow> {
  const connection = await findConnection(db, userId);
  if (connection === undefined) throw notFound();
  return connection;
}

export async function requireUsableConnection(db: Database, userId: string): Promise<ConnectedRow> {
  const connection = await requireConnection(db, userId);
  if (connection.status === "needs_reauth") throw notionReauthRequired();
  return connection;
}

export async function disconnect(db: Database, userId: string): Promise<void> {
  await db.update(notionConnections).set(NO_TOKENS).where(eq(notionConnections.userId, userId));
}

export async function setConnectionStatus(
  db: Database,
  id: string,
  status: NotionConnectionStatus,
): Promise<ConnectedRow> {
  const [row] = await db
    .update(notionConnections)
    .set({ status })
    .where(eq(notionConnections.id, id))
    .returning();
  if (row === undefined || !isConnected(row)) throw notFound();
  return row;
}

export async function readTokens(
  db: Database,
  secret: string,
  id: string,
): Promise<NotionTokens | undefined> {
  const row = await db.query.notionConnections.findFirst({ where: eq(notionConnections.id, id) });
  if (row === undefined || !isConnected(row)) return undefined;
  return {
    accessToken: await decryptToken(secret, row.accessTokenEnc),
    refreshToken: await decryptOptional(secret, row.refreshTokenEnc),
  };
}

export async function storeTokens(
  db: Database,
  secret: string,
  id: string,
  tokens: NotionTokens,
): Promise<void> {
  await db
    .update(notionConnections)
    .set(await encryptTokens(secret, tokens))
    .where(eq(notionConnections.id, id));
}

export async function toNotionConnection(
  db: Database,
  row: ConnectedRow,
): Promise<NotionConnection> {
  return {
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    workspaceIcon: row.workspaceIcon,
    status: row.status,
    databases: await listNotionDatabases(db, row.userId),
    createdAt: row.createdAt.toISOString(),
  };
}

function isConnected(row: ConnectionRow): row is ConnectedRow {
  return row.accessTokenEnc !== null;
}

async function encryptTokens(secret: string, tokens: NotionTokens): Promise<EncryptedTokens> {
  return {
    accessTokenEnc: await encryptToken(secret, tokens.accessToken),
    refreshTokenEnc: await encryptOptional(secret, tokens.refreshToken),
  };
}

async function encryptOptional(secret: string, token: string | null): Promise<string | null> {
  return token === null ? null : encryptToken(secret, token);
}

async function decryptOptional(secret: string, sealed: string | null): Promise<string | null> {
  return sealed === null ? null : decryptToken(secret, sealed);
}
