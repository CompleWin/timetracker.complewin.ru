import { describe, expect, it } from "vitest";
import { tc } from "@stt/shared";
import { hasValue, keysOf } from "./dictionary.ts";

type PluralKey = Parameters<typeof tc>[1];

const SESSIONS_RU = "{count} сессия|{count} сессии|{count} сессий";

const sessionCounts: [count: number, ru: string, en: string][] = [
  [0, "0 сессий", "0 sessions"],
  [1, "1 сессия", "1 session"],
  [2, "2 сессии", "2 sessions"],
  [5, "5 сессий", "5 sessions"],
  [11, "11 сессий", "11 sessions"],
  [21, "21 сессия", "21 sessions"],
  [22, "22 сессии", "22 sessions"],
];

function isSessionsKey(key: string): key is PluralKey {
  return hasValue("ru", key, SESSIONS_RU);
}

function sessionsKey(): PluralKey {
  const [key] = keysOf("ru").filter(isSessionsKey);
  if (key === undefined) throw new Error(`messages.ru has no key with value "${SESSIONS_RU}"`);
  return key;
}

describe("tc", () => {
  it.each(sessionCounts)(
    `8. для ключа «${SESSIONS_RU}» count %i даёт «%s» в ru и «%s» в en`,
    (count, ru, en) => {
      const key = sessionsKey();

      expect(tc("ru", key, count)).toBe(ru);
      expect(tc("en", key, count)).toBe(en);
    },
  );
});
