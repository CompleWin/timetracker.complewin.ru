import { t } from "./i18n/t.ts";
import type { Locale } from "./i18n/locale.ts";

export const WEBHOOK_PATH = "/tg/webhook";

export const BOT_COMMANDS = ["start", "status", "stop"] as const;

export const BOT_UPDATE_TYPES = ["message", "callback_query", "my_chat_member"] as const;

export type BotSetupCall = {
  method: "setWebhook" | "setMyCommands";
  body: Record<string, unknown>;
};

export function botSetupCalls(appUrl: string, webhookSecret: string): BotSetupCall[] {
  return [
    {
      method: "setWebhook",
      body: {
        url: `${appUrl}${WEBHOOK_PATH}`,
        secret_token: webhookSecret,
        allowed_updates: [...BOT_UPDATE_TYPES],
        drop_pending_updates: true,
      },
    },
    { method: "setMyCommands", body: { commands: botCommands("ru"), language_code: "ru" } },
    { method: "setMyCommands", body: { commands: botCommands("en") } },
  ];
}

function botCommands(locale: Locale): { command: string; description: string }[] {
  return BOT_COMMANDS.map((command) => ({
    command,
    description: t(locale, `bot.command.${command}`),
  }));
}
