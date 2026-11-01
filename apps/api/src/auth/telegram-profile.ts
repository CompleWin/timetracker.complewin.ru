import type { JWTPayload } from "jose";

const FALLBACK_NAME = "Telegram user";
const BOT_ACCESS_SCOPE = "telegram:bot_access";

export type TelegramProfile = {
  telegramId: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
};

export function profileFromClaims(claims: JWTPayload): TelegramProfile | undefined {
  const telegramId = toTelegramId("id" in claims ? claims.id : claims.sub);
  if (telegramId === undefined) return undefined;
  return {
    telegramId,
    name: displayName(claims),
    username: text(claims.preferred_username) ?? null,
    photoUrl: text(claims.picture) ?? null,
  };
}

export function grantsBotAccess(scope: string | undefined): boolean {
  return scope?.split(" ").includes(BOT_ACCESS_SCOPE) ?? false;
}

function toTelegramId(value: unknown): number | undefined {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function displayName(claims: JWTPayload): string {
  return text(claims.name) ?? fullName(claims) ?? text(claims.preferred_username) ?? FALLBACK_NAME;
}

function fullName(claims: JWTPayload): string | undefined {
  const parts = [text(claims.given_name), text(claims.family_name)].filter(
    (part) => part !== undefined,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
