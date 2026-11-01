import { safeReturnTo, type Locale, type User } from "@stt/shared";
import { database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { signInUser, type SignInProfile } from "../users/users.ts";
import { consumeLoginState, createLoginState } from "./login-states.ts";
import {
  authorizationUrl,
  exchangeCode,
  loadDiscovery,
  telegramClient,
  verifyIdToken,
} from "./telegram-oidc.ts";
import { grantsBotAccess, profileFromClaims, type TelegramProfile } from "./telegram-profile.ts";

export type SignInError = "cancelled" | "state" | "token" | "unavailable";

export class SignInFailure extends Error {
  constructor(readonly reason: SignInError) {
    super(`Telegram sign-in failed: ${reason}`);
  }
}

export type CallbackRequest = {
  query: { code?: string; state?: string; error?: string };
  locale: Locale;
  now: Date;
};

export type CompletedLogin = {
  user: User;
  returnTo: string;
};

export async function beginTelegramLogin(
  env: Bindings,
  returnTo: string | undefined,
  now: Date,
): Promise<string> {
  const client = telegramClient(env);
  const discovery = await orFail(loadDiscovery(client), "unavailable");
  const loginState = await createLoginState(database(env), safeReturnTo(returnTo), now);
  return authorizationUrl(client, discovery, loginState);
}

export async function completeTelegramLogin(
  env: Bindings,
  { query, locale, now }: CallbackRequest,
): Promise<CompletedLogin> {
  const db = database(env);
  const loginState = query.state && (await consumeLoginState(db, query.state, now));
  if (query.error !== undefined) throw new SignInFailure("cancelled");
  if (!loginState) throw new SignInFailure("state");
  if (!query.code) throw new SignInFailure("token");

  const client = telegramClient(env);
  const discovery = await orFail(loadDiscovery(client), "unavailable");
  const tokens = await orFail(
    exchangeCode(client, discovery, query.code, loginState.codeVerifier),
    "token",
  );
  const claims = await orFail(
    verifyIdToken(client, discovery, tokens.id_token, { nonce: loginState.nonce, now }),
    "token",
  );
  const profile = profileFromClaims(claims);
  if (profile === undefined) throw new SignInFailure("token");

  const signIn = telegramSignIn(profile, grantsBotAccess(tokens.scope), locale);
  const user = await signInUser(db, profile.telegramId, signIn, now);
  return { user, returnTo: loginState.returnTo };
}

function telegramSignIn(
  { name, username, photoUrl }: TelegramProfile,
  botAccess: boolean,
  locale: Locale,
): SignInProfile {
  return {
    whenNew: { name, username, photoUrl, botCanMessage: botAccess, locale },
    changes: { name, username, photoUrl, botCanMessage: botAccess ? true : undefined },
  };
}

async function orFail<T>(promise: Promise<T>, reason: SignInError): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.warn(`Telegram sign-in step failed (${reason}):`, String(error));
    throw new SignInFailure(reason);
  }
}
