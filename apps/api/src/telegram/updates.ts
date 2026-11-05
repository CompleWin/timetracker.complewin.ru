import { z } from "zod";

const sender = z.object({ id: z.number(), language_code: z.string().optional() });

const chat = z.object({ id: z.number(), type: z.string() });

export const inlineButton = z.object({
  text: z.string(),
  url: z.string().optional(),
  callback_data: z.string().optional(),
});

const message = z.object({
  message_id: z.number(),
  from: sender.optional(),
  chat,
  text: z.string().optional(),
  reply_markup: z.object({ inline_keyboard: z.array(z.array(inlineButton)) }).optional(),
});

const callbackQuery = z.object({
  id: z.string(),
  from: sender,
  data: z.string().optional(),
  message: message.optional(),
});

const chatMemberUpdate = z.object({
  chat,
  from: sender,
  new_chat_member: z.object({ status: z.string() }),
});

export const telegramUpdate = z.object({
  message: message.optional(),
  callback_query: callbackQuery.optional(),
  my_chat_member: chatMemberUpdate.optional(),
});

export type Sender = z.infer<typeof sender>;
export type Chat = z.infer<typeof chat>;
export type InlineButton = z.infer<typeof inlineButton>;
export type InlineKeyboard = InlineButton[][];
export type IncomingMessage = z.infer<typeof message>;
export type CallbackQuery = z.infer<typeof callbackQuery>;
export type ChatMemberUpdate = z.infer<typeof chatMemberUpdate>;

export function isPrivate(target: Chat): boolean {
  return target.type === "private";
}
