import type { DevLoginBody, Locale, User } from "@stt/shared";
import { database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { signInUser, type SignInProfile } from "../users/users.ts";

const DEV_TELEGRAM_ID = 1;
const DEV_NAME = "Dev User";

export function devLogin(
  env: Bindings,
  body: DevLoginBody,
  locale: Locale,
  now: Date,
): Promise<User> {
  return signInUser(
    database(env),
    body.telegramId ?? DEV_TELEGRAM_ID,
    devSignIn(body, locale),
    now,
  );
}

function devSignIn({ name, username, locale }: DevLoginBody, defaultLocale: Locale): SignInProfile {
  return {
    whenNew: {
      name: name ?? DEV_NAME,
      username: username ?? null,
      photoUrl: null,
      botCanMessage: false,
      locale: locale ?? defaultLocale,
    },
    changes: { name, username, locale },
  };
}
