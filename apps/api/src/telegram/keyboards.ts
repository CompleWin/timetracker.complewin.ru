import { t, type Locale, type SessionWithTask } from "@stt/shared";
import type { InlineButton, InlineKeyboard } from "./updates.ts";

export type ReplyMarkup = { inline_keyboard: InlineKeyboard };

export function markup(keyboard: InlineKeyboard): ReplyMarkup {
  return { inline_keyboard: keyboard };
}

export function trackerLink(locale: Locale, appUrl: string): ReplyMarkup {
  return markup([[{ text: t(locale, "bot.openTracker"), url: appUrl }]]);
}

export function stopButtons(locale: Locale, sessions: SessionWithTask[]): ReplyMarkup {
  return markup(
    sessions.map((session) => [
      {
        text: t(locale, "bot.stopButton", { title: session.task.title }),
        callback_data: stopData(session.id),
      },
    ]),
  );
}

export function reminderButtons(locale: Locale, sessionId: string): ReplyMarkup {
  return markup([
    [{ text: t(locale, "bot.reminder.stop"), callback_data: stopData(sessionId) }],
    [{ text: t(locale, "bot.reminder.snooze"), callback_data: snoozeData(sessionId) }],
  ]);
}

export function withoutButton(keyboard: InlineKeyboard, data: string): InlineKeyboard {
  return keyboard
    .map((row) => row.filter((button: InlineButton) => button.callback_data !== data))
    .filter((row) => row.length > 0);
}

function stopData(sessionId: string): string {
  return `stop:${sessionId}`;
}

function snoozeData(sessionId: string): string {
  return `snooze:${sessionId}`;
}
