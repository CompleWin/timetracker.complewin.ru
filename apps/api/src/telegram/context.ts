import { localeFromLanguage, type Locale } from "@stt/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { users } from "../db/schema.ts";
import type { Bindings } from "../env.ts";
import { botApi, userBotApi, type BotApi } from "./bot-api.ts";
import type { ReplyMarkup } from "./keyboards.ts";
import type { Sender } from "./updates.ts";

export type BotUser = typeof users.$inferSelect;

export type BotContext = {
  env: Bindings;
  db: Database;
  now: Date;
  user: BotUser | undefined;
  locale: Locale;
  bot: BotApi;
};

export async function botContext(
  env: Bindings,
  db: Database,
  now: Date,
  sender: Sender,
): Promise<BotContext> {
  const user = await findBotUser(db, sender.id);
  return {
    env,
    db,
    now,
    user,
    locale: user?.locale ?? localeFromLanguage(sender.language_code),
    bot: user === undefined ? botApi(env) : userBotApi(env, db, user.id),
  };
}

export function findBotUser(db: Database, telegramId: number): Promise<BotUser | undefined> {
  return db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
}

export async function sendMessage(
  { bot }: BotContext,
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  await bot("sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });
}
