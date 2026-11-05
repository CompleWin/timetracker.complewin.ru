import { formatClock, t, type SessionWithTask } from "@stt/shared";
import { listActiveSessions } from "../timers/timers.ts";
import { updateUser } from "../users/users.ts";
import { sendMessage, type BotContext, type BotUser } from "./context.ts";
import { stopButtons, trackerLink, type ReplyMarkup } from "./keyboards.ts";
import type { IncomingMessage } from "./updates.ts";

type Reply = {
  text: string;
  replyMarkup?: ReplyMarkup;
};

const COMMAND = /^\/(\w+)(@\w+)?(\s|$)/;

export async function handleMessage(context: BotContext, message: IncomingMessage): Promise<void> {
  const reply =
    context.user === undefined
      ? signInFirst(context)
      : await commandReply(context, context.user, commandOf(message.text));
  await sendMessage(context, message.chat.id, reply.text, reply.replyMarkup);
}

function signInFirst({ locale, env }: BotContext): Reply {
  return { text: t(locale, "bot.signInFirst"), replyMarkup: trackerLink(locale, env.APP_URL) };
}

async function commandReply(
  context: BotContext,
  user: BotUser,
  command: string | undefined,
): Promise<Reply> {
  if (command === "start") return start(context, user);
  if (command === "status") return status(context, await runningSessions(context, user));
  if (command === "stop") return stopQuestion(context, await runningSessions(context, user));
  return { text: t(context.locale, "bot.notUnderstood") };
}

async function start({ db, locale, env }: BotContext, user: BotUser): Promise<Reply> {
  await updateUser(db, user.id, { botCanMessage: true });
  return { text: t(locale, "bot.started"), replyMarkup: trackerLink(locale, env.APP_URL) };
}

function status({ locale }: BotContext, sessions: SessionWithTask[]): Reply {
  if (sessions.length === 0) return { text: t(locale, "bot.nothingRunning") };
  const lines = sessions.map((session) =>
    t(locale, "bot.runningLine", {
      title: session.task.title,
      clock: formatClock(session.durationSec),
    }),
  );
  return {
    text: [t(locale, "bot.runningNow"), ...lines].join("\n"),
    replyMarkup: stopButtons(locale, sessions),
  };
}

function stopQuestion({ locale }: BotContext, sessions: SessionWithTask[]): Reply {
  if (sessions.length === 0) return { text: t(locale, "bot.nothingRunning") };
  return { text: t(locale, "bot.whatToStop"), replyMarkup: stopButtons(locale, sessions) };
}

function runningSessions({ db, now }: BotContext, user: BotUser): Promise<SessionWithTask[]> {
  return listActiveSessions(db, user.id, now);
}

function commandOf(text: string | undefined): string | undefined {
  return COMMAND.exec(text?.trim() ?? "")?.[1]?.toLowerCase();
}
