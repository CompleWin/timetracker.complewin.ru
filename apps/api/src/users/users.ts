import type { User } from "@stt/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { users } from "../db/schema.ts";

type UserRow = typeof users.$inferSelect;

export type UserFields = Omit<User, "id" | "telegramId" | "timezone" | "reminderThresholdMin">;

export type UserChanges = Partial<Omit<User, "id" | "telegramId">>;

export type SignInProfile = {
  whenNew: UserFields;
  changes: UserChanges;
};

export async function signInUser(
  db: Database,
  telegramId: number,
  profile: SignInProfile,
  now: Date,
): Promise<User> {
  const existing = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (existing === undefined) return createUser(db, telegramId, profile.whenNew, now);
  return updateUser(db, existing.id, profile.changes);
}

export async function updateUser(db: Database, id: string, changes: UserChanges): Promise<User> {
  const [row] = hasChanges(changes)
    ? await db.update(users).set(changes).where(eq(users.id, id)).returning()
    : await db.select().from(users).where(eq(users.id, id));
  if (row === undefined) throw new Error(`User ${id} not found`);
  return toUser(row);
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    telegramId: row.telegramId,
    name: row.name,
    username: row.username,
    photoUrl: row.photoUrl,
    timezone: row.timezone,
    locale: row.locale,
    botCanMessage: row.botCanMessage,
    reminderThresholdMin: row.reminderThresholdMin,
  };
}

async function createUser(
  db: Database,
  telegramId: number,
  fields: UserFields,
  now: Date,
): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({ id: crypto.randomUUID(), telegramId, createdAt: now, ...fields })
    .returning();
  if (row === undefined) throw new Error(`User with Telegram id ${telegramId} was not created`);
  return toUser(row);
}

function hasChanges(changes: UserChanges): boolean {
  return Object.values(changes).some((value) => value !== undefined);
}
