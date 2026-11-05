import { database, type Database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { updateUser } from "../users/users.ts";
import { handleCallback } from "./buttons.ts";
import { handleMessage } from "./commands.ts";
import { botContext, findBotUser } from "./context.ts";
import { isPrivate, telegramUpdate, type ChatMemberUpdate } from "./updates.ts";

const CAN_MESSAGE_BY_STATUS: Partial<Record<string, boolean>> = { member: true, kicked: false };

export async function handleUpdate(env: Bindings, payload: unknown, now: Date): Promise<void> {
  const parsed = telegramUpdate.safeParse(payload);
  if (!parsed.success) return;
  const db = database(env);
  const { message, callback_query: query, my_chat_member: membership } = parsed.data;
  if (message?.from !== undefined && isPrivate(message.chat)) {
    return handleMessage(await botContext(env, db, now, message.from), message);
  }
  if (query !== undefined && (query.message === undefined || isPrivate(query.message.chat))) {
    return handleCallback(await botContext(env, db, now, query.from), query);
  }
  if (membership !== undefined && isPrivate(membership.chat)) {
    return handleMembership(db, membership);
  }
}

async function handleMembership(db: Database, membership: ChatMemberUpdate): Promise<void> {
  const botCanMessage = CAN_MESSAGE_BY_STATUS[membership.new_chat_member.status];
  const user = await findBotUser(db, membership.from.id);
  if (botCanMessage === undefined || user === undefined) return;
  await updateUser(db, user.id, { botCanMessage });
}
