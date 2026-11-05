import { describe, expect, it } from "vitest";
import { tc } from "@stt/shared";
import { keysOf, keysWithValue } from "./dictionary.ts";

type PluralKey = Parameters<typeof tc>[1];
type PluralCase = [count: number, ru: string, en: string];

const SESSIONS_RU = "{count} сессия|{count} сессии|{count} сессий";
const DAYS_RU_START = "{count} день|{count} дня|{count} дней";

const sessionCounts: PluralCase[] = [
  [0, "0 сессий", "0 sessions"],
  [1, "1 сессия", "1 session"],
  [2, "2 сессии", "2 sessions"],
  [5, "5 сессий", "5 sessions"],
  [11, "11 сессий", "11 sessions"],
  [21, "21 сессия", "21 sessions"],
  [22, "22 сессии", "22 sessions"],
];

const dayCounts: PluralCase[] = [
  [1, "1 день", "1 day"],
  [2, "2 дня", "2 days"],
  [5, "5 дней", "5 days"],
  [14, "14 дней", "14 days"],
];

function isPluralKey(key: string): key is PluralKey {
  return keysOf("ru").includes(key);
}

function pluralKey(description: string, matches: (ruValue: string) => boolean): PluralKey {
  const [key] = keysWithValue("ru", matches).filter(isPluralKey);
  if (key === undefined) throw new Error(`messages.ru has no key whose value ${description}`);
  return key;
}

function sessionsKey(): PluralKey {
  return pluralKey(`is "${SESSIONS_RU}"`, (value) => value === SESSIONS_RU);
}

function daysKey(): PluralKey {
  return pluralKey(`starts with "${DAYS_RU_START}"`, (value) => value.startsWith(DAYS_RU_START));
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

  it.each(dayCounts)(
    `2. для ключа, чьё ru-значение начинается с «${DAYS_RU_START}», count %i даёт «%s» в ru и «%s» в en`,
    (count, ru, en) => {
      const key = daysKey();

      expect(tc("ru", key, count)).toBe(ru);
      expect(tc("en", key, count)).toBe(en);
    },
  );
});
