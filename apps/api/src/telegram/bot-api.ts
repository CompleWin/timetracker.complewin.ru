import type { Database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { updateUser } from "../users/users.ts";

const DEFAULT_API_BASE = "https://api.telegram.org";
const FORBIDDEN = 403;

export type BotOutcome = "sent" | "blocked" | "failed";

export type BotApi = (method: string, body: object) => Promise<BotOutcome>;

export function botApi(env: Bindings): BotApi {
  const base = env.TG_API_BASE ?? DEFAULT_API_BASE;
  return async (method, body) => {
    try {
      const response = await fetch(`${base}/bot${env.TG_BOT_TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return outcomeOf(response.status);
    } catch (error) {
      console.warn(`Telegram ${method} failed:`, String(error));
      return "failed";
    }
  };
}

export function userBotApi(env: Bindings, db: Database, userId: string): BotApi {
  const call = botApi(env);
  return async (method, body) => {
    const outcome = await call(method, body);
    if (outcome === "blocked") await updateUser(db, userId, { botCanMessage: false });
    return outcome;
  };
}

function outcomeOf(status: number): BotOutcome {
  if (status === FORBIDDEN) return "blocked";
  return status >= 200 && status < 300 ? "sent" : "failed";
}
