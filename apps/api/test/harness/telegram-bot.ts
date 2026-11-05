import { z } from "zod";
import { api, type TestResponse, type TestSession } from "./api.ts";
import { atSecond } from "./clock.ts";
import { external, type ExternalCall } from "./external.ts";
import type { SessionOpts } from "./rest.ts";
import { loginAs, sessionFrom, type TestUser } from "./session.ts";
import { fakeTelegram, telegramProfile } from "./telegram.ts";
import { testEnv } from "./test-env.ts";

export type Locale = TestUser["locale"];

export type Sender = {
  telegramId: number;
  languageCode: string;
};

export type BotUser = {
  session: TestSession;
  sender: Sender;
};

export type InlineButton = z.infer<typeof inlineButton>;

export type SentMessage = {
  messageId: number;
  chatId: string;
  text: string;
  keyboard: InlineButton[][];
};

export type CallbackAnswer = {
  queryId: string;
  text: string;
};

export type MarkupEdit = {
  chatId: string;
  messageId: number;
  buttons: InlineButton[];
};

export type ButtonPress = {
  response: TestResponse;
  queryId: string;
};

export type ChatKind = "private" | "group";

export type MemberStatus = "member" | "kicked";

export type TelegramUpdate = Record<string, unknown>;

export type FakeBot = {
  failWith(method: string, status: number): void;
  recover(method: string): void;
  sentMessages(): SentMessage[];
  callbackAnswers(): CallbackAnswer[];
  markupEdits(): MarkupEdit[];
  forget(): void;
};

type BotCall = {
  method: string;
  body: unknown;
  messageId: number;
};

export const WEBHOOK_PATH = "/tg/webhook";
export const WEBHOOK_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";
const TELEGRAM_API_URL = new RegExp(`^${escapeRegExp(testEnv.TG_API_BASE)}/`);

const BOT_METHOD_URL = new RegExp(
  `^${escapeRegExp(`${testEnv.TG_API_BASE}/bot${testEnv.TG_BOT_TOKEN}/`)}(\\w+)$`,
);
const UPDATE_DATE_SEC = Date.parse("2030-01-01T00:00:00.000Z") / 1000;
const BOT_PROFILE = {
  id: 7_000_000_001,
  is_bot: true,
  first_name: "SimpleTimeTracker",
  username: testEnv.TG_BOT_USERNAME,
};
const GROUP_CHAT = { id: -1_001_234_567_890, type: "group", title: "Команда" };

const chatId = z.union([z.number(), z.string()]).transform(String);
const inlineButton = z.object({
  text: z.string(),
  url: z.string().optional(),
  callback_data: z.string().optional(),
});
const replyMarkup = z.object({ inline_keyboard: z.array(z.array(inlineButton)) });
const sendMessageBody = z.object({
  chat_id: chatId,
  text: z.string(),
  reply_markup: replyMarkup.optional(),
});
const answerCallbackBody = z.object({ callback_query_id: z.string(), text: z.string() });
const editMarkupBody = z.object({
  chat_id: chatId,
  message_id: z.number(),
  reply_markup: replyMarkup.optional(),
});
const chatIdOnly = z.object({ chat_id: z.union([z.number(), z.string()]) });

let lastUpdateId = 0;

export function fakeBot(): FakeBot {
  const calls: BotCall[] = [];
  const failures = new Map<string, number>();
  let lastMessageId = 0;

  external.on("POST", BOT_METHOD_URL, async (request) => {
    lastMessageId += 1;
    const call = {
      method: methodOf(request.url),
      body: await jsonOf(request),
      messageId: lastMessageId,
    };
    calls.push(call);
    const failure = failures.get(call.method);
    return failure === undefined ? telegramOk(call) : telegramError(failure);
  });

  function callsOf(method: string): BotCall[] {
    return calls.filter((call) => call.method === method);
  }

  return {
    failWith: (method, status) => {
      failures.set(method, status);
    },
    recover: (method) => {
      failures.delete(method);
    },
    sentMessages: () =>
      callsOf("sendMessage").map((call) => {
        const body = sendMessageBody.parse(call.body);
        return {
          messageId: call.messageId,
          chatId: body.chat_id,
          text: body.text,
          keyboard: body.reply_markup?.inline_keyboard ?? [],
        };
      }),
    callbackAnswers: () =>
      callsOf("answerCallbackQuery").map((call) => {
        const body = answerCallbackBody.parse(call.body);
        return { queryId: body.callback_query_id, text: body.text };
      }),
    markupEdits: () =>
      callsOf("editMessageReplyMarkup").map((call) => {
        const body = editMarkupBody.parse(call.body);
        return {
          chatId: body.chat_id,
          messageId: body.message_id,
          buttons: (body.reply_markup?.inline_keyboard ?? []).flat(),
        };
      }),
    forget: () => {
      calls.length = 0;
    },
  };
}

export function telegramApiCalls(): ExternalCall[] {
  return external.calls({ url: TELEGRAM_API_URL });
}

export async function loginWithBotAccess(locale: Locale = "ru"): Promise<BotUser> {
  const telegram = await fakeTelegram();
  const opts = { ...atSecond(0), headers: { "Accept-Language": locale } };
  const response = await telegram.callback(await telegram.start("/", opts), {}, opts);
  return {
    session: sessionFrom(response),
    sender: { telegramId: telegramProfile.telegramId, languageCode: locale },
  };
}

export async function loginWithoutBotAccess(
  telegramId: number,
  locale: Locale = "ru",
): Promise<BotUser> {
  const { session } = await loginAs({ telegramId, locale }, atSecond(0));
  return { session, sender: { telegramId, languageCode: locale } };
}

export function sendUpdate(update: TelegramUpdate, opts: SessionOpts = {}): Promise<TestResponse> {
  return api.post(WEBHOOK_PATH, update, {
    ...opts,
    headers: { [WEBHOOK_SECRET_HEADER]: testEnv.TG_WEBHOOK_SECRET, ...opts.headers },
  });
}

export function sendText(sender: Sender, text: string, opts?: SessionOpts): Promise<TestResponse> {
  return sendUpdate(textUpdate(sender, text), opts);
}

export async function pressButton(
  sender: Sender,
  message: SentMessage,
  data: string,
  opts?: SessionOpts,
): Promise<ButtonPress> {
  const update = callbackUpdate(sender, message, data);
  return { response: await sendUpdate(update.update, opts), queryId: update.queryId };
}

export function textUpdate(
  sender: Sender,
  text: string,
  chat: ChatKind = "private",
): TelegramUpdate {
  const updateId = nextUpdateId();
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: telegramUser(sender),
      chat: chat === "private" ? privateChat(sender) : GROUP_CHAT,
      date: UPDATE_DATE_SEC,
      text,
      ...commandEntities(text),
    },
  };
}

export function chatMemberUpdate(sender: Sender, status: MemberStatus): TelegramUpdate {
  const previousStatus: MemberStatus = status === "kicked" ? "member" : "kicked";
  return {
    update_id: nextUpdateId(),
    my_chat_member: {
      chat: privateChat(sender),
      from: telegramUser(sender),
      date: UPDATE_DATE_SEC,
      old_chat_member: memberOf(previousStatus),
      new_chat_member: memberOf(status),
    },
  };
}

export function messageWithButton(sender: Sender, button: InlineButton): SentMessage {
  return {
    messageId: nextUpdateId(),
    chatId: String(sender.telegramId),
    text: "Что остановить?",
    keyboard: [[button]],
  };
}

export function only<Item>(items: Item[]): Item {
  const [item] = items;
  if (items.length !== 1 || item === undefined) {
    throw new Error(`Expected exactly one item, got ${items.length}: ${JSON.stringify(items)}`);
  }
  return item;
}

export function callbackButton(text: string, data: string): InlineButton {
  return { text, callback_data: data };
}

export function textLines(message: SentMessage): string[] {
  return message.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function buttonsOf(message: SentMessage): InlineButton[] {
  return message.keyboard.flat();
}

function callbackUpdate(
  sender: Sender,
  message: SentMessage,
  data: string,
): { update: TelegramUpdate; queryId: string } {
  const updateId = nextUpdateId();
  const queryId = `query-${updateId}`;
  return {
    queryId,
    update: {
      update_id: updateId,
      callback_query: {
        id: queryId,
        from: telegramUser(sender),
        chat_instance: `chat-instance-${sender.telegramId}`,
        data,
        message: {
          message_id: message.messageId,
          from: BOT_PROFILE,
          chat: privateChat(sender),
          date: UPDATE_DATE_SEC,
          text: message.text,
          reply_markup: { inline_keyboard: message.keyboard },
        },
      },
    },
  };
}

function nextUpdateId(): number {
  lastUpdateId += 1;
  return lastUpdateId;
}

function telegramUser(sender: Sender): Record<string, unknown> {
  return {
    id: sender.telegramId,
    is_bot: false,
    first_name: "Ivan",
    language_code: sender.languageCode,
  };
}

function privateChat(sender: Sender): Record<string, unknown> {
  return { id: sender.telegramId, type: "private", first_name: "Ivan" };
}

function memberOf(status: MemberStatus): Record<string, unknown> {
  return status === "kicked"
    ? { user: BOT_PROFILE, status, until_date: 0 }
    : { user: BOT_PROFILE, status };
}

function commandEntities(text: string): Record<string, unknown> {
  if (!text.startsWith("/")) return {};
  const [command = ""] = text.split(" ");
  return { entities: [{ type: "bot_command", offset: 0, length: command.length }] };
}

function methodOf(url: string): string {
  return BOT_METHOD_URL.exec(url)?.[1] ?? "";
}

async function jsonOf(request: Request): Promise<unknown> {
  const text = await request.text();
  return text === "" ? {} : JSON.parse(text);
}

function telegramOk(call: BotCall): Response {
  return Response.json({ ok: true, result: resultOf(call) });
}

function resultOf(call: BotCall): unknown {
  if (call.method === "getMe") return BOT_PROFILE;
  if (call.method !== "sendMessage") return true;
  const parsed = chatIdOnly.safeParse(call.body);
  return {
    message_id: call.messageId,
    from: BOT_PROFILE,
    chat: { id: parsed.success ? parsed.data.chat_id : 0, type: "private" },
    date: UPDATE_DATE_SEC,
  };
}

function telegramError(status: number): Response {
  const retry = status === 429 ? { parameters: { retry_after: 1 } } : {};
  return Response.json(
    { ok: false, error_code: status, description: `Telegram answered ${status}`, ...retry },
    { status },
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
