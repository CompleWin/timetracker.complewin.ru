import { formatClock, formatDuration, t } from "@stt/shared";
import { ApiError } from "../http/errors.ts";
import { requireTask } from "../tasks/tasks.ts";
import { stopSession } from "../timers/timers.ts";
import type { BotContext, BotUser } from "./context.ts";
import { markup, withoutButton } from "./keyboards.ts";
import { snoozeReminder } from "./reminders.ts";
import type { CallbackQuery, InlineKeyboard } from "./updates.ts";

type ButtonAction = {
  kind: "stop" | "snooze";
  sessionId: string;
};

type ButtonResult = {
  answer: string;
  keyboard?: InlineKeyboard;
};

const ACTION = /^(stop|snooze):(.+)$/;
const SECONDS_PER_MINUTE = 60;

export async function handleCallback(context: BotContext, query: CallbackQuery): Promise<void> {
  const action = actionOf(query.data);
  if (action === undefined) return;
  const result = await press(context, action, query);
  await context.bot("answerCallbackQuery", { callback_query_id: query.id, text: result.answer });
  if (result.keyboard !== undefined && query.message !== undefined) {
    await context.bot("editMessageReplyMarkup", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: result.keyboard.length > 0 ? markup(result.keyboard) : undefined,
    });
  }
}

async function press(
  context: BotContext,
  action: ButtonAction,
  query: CallbackQuery,
): Promise<ButtonResult> {
  const { user } = context;
  if (user === undefined) return alreadyStopped(context);
  if (action.kind === "snooze") return snooze(context, user, action.sessionId);
  const current = query.message?.reply_markup?.inline_keyboard ?? [];
  return stop(context, user, action.sessionId, withoutButton(current, query.data ?? ""));
}

async function stop(
  context: BotContext,
  user: BotUser,
  sessionId: string,
  keyboard: InlineKeyboard,
): Promise<ButtonResult> {
  const { db, now, locale } = context;
  try {
    const session = await stopSession(db, user.id, sessionId, now);
    const task = await requireTask(db, user.id, session.taskId);
    const clock = formatClock(session.durationSec);
    return { answer: t(locale, "bot.stopped", { title: task.title, clock }), keyboard };
  } catch (error) {
    if (error instanceof ApiError) return alreadyStopped(context);
    throw error;
  }
}

async function snooze(
  context: BotContext,
  user: BotUser,
  sessionId: string,
): Promise<ButtonResult> {
  const { db, now, locale } = context;
  if (!(await snoozeReminder(db, user.id, sessionId, now))) return alreadyStopped(context);
  const duration = formatDuration(user.reminderThresholdMin * SECONDS_PER_MINUTE, locale);
  return { answer: t(locale, "bot.snoozed", { duration }), keyboard: [] };
}

function alreadyStopped({ locale }: BotContext): ButtonResult {
  return { answer: t(locale, "bot.alreadyStopped") };
}

function actionOf(data: string | undefined): ButtonAction | undefined {
  const [, kind, sessionId] = ACTION.exec(data ?? "") ?? [];
  if ((kind !== "stop" && kind !== "snooze") || sessionId === undefined) return undefined;
  return { kind, sessionId };
}
