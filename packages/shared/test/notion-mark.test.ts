import { describe, expect, it } from "vitest";
import { messages, type Locale } from "@stt/shared";
import { entriesOf, keysOf, keysWithValue } from "./dictionary.ts";

const REMOVED_KEYS = [
  "notionSync.export",
  "notionDatabases.isDefault",
  "projects.notionDatabaseDefault",
];
const locales = ["ru", "en"] as const satisfies readonly Locale[];

function valueOf(locale: Locale, key: string): unknown {
  return entriesOf(messages[locale]).find(([candidate]) => candidate === key)?.[1];
}

function isRemoved(key: string): boolean {
  return REMOVED_KEYS.some((removed) => key === removed || key.startsWith(`${removed}.`));
}

describe("тексты знака Notion", () => {
  it("14. в словаре ru есть «Задача из Notion», тот же ключ в en даёт «Task from Notion»", () => {
    const keys = keysWithValue("ru", (value) => value === "Задача из Notion");

    expect(keys).not.toEqual([]);
    expect(new Set(keys.map((key) => valueOf("en", key)))).toEqual(new Set(["Task from Notion"]));
  });

  it.each(locales)(
    "14. в словаре %s нет ключей notionSync.export, notionDatabases.isDefault и projects.notionDatabaseDefault",
    (locale) => {
      expect(keysOf(locale).filter(isRemoved)).toEqual([]);
    },
  );
});
