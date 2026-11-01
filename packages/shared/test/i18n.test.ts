import { describe, expect, expectTypeOf, it } from "vitest";
import { messages, t, type Locale } from "@stt/shared";

type Entry = [key: string, value: unknown];
type MessageKey = Parameters<typeof t>[1];

const locales = ["ru", "en"] as const satisfies readonly Locale[];

function entriesOf(dictionary: object, prefix = ""): Entry[] {
  return Object.entries(dictionary).flatMap(([key, value]): Entry[] => {
    const path = `${prefix}${key}`;
    return isNested(value) ? entriesOf(value, `${path}.`) : [[path, value]];
  });
}

function isNested(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function keysOf(locale: Locale): string[] {
  return entriesOf(messages[locale])
    .map(([key]) => key)
    .sort();
}

function isMessageKey(key: string): key is MessageKey {
  return keysOf("ru").includes(key);
}

function keysRenderedAs(
  locale: Locale,
  text: string,
  params: Record<string, string>,
): MessageKey[] {
  return keysOf(locale)
    .filter(isMessageKey)
    .filter((key) => t(locale, key, params) === text);
}

function emptyKeysOf(locale: Locale): string[] {
  return entriesOf(messages[locale])
    .filter(([, value]) => typeof value !== "string" || value === "")
    .map(([key]) => key);
}

describe("словари messages", () => {
  it("10. словари есть ровно для ru и en", () => {
    expectTypeOf<Locale>().toEqualTypeOf<"ru" | "en">();
    expect(Object.keys(messages).sort()).toEqual(["en", "ru"]);
  });

  it("10. у ru и en одинаковый набор ключей", () => {
    expect(keysOf("ru")).toContain("app.name");
    expect(keysOf("en")).toEqual(keysOf("ru"));
  });

  it.each(locales)("10. в словаре %s нет пустых значений", (locale) => {
    expect(emptyKeysOf(locale)).toEqual([]);
  });
});

describe("t", () => {
  it.each(locales)('11. t("%s", "app.name") возвращает «SimpleTimeTracker»', (locale) => {
    expect(t(locale, "app.name")).toBe("SimpleTimeTracker");
  });

  it("11. t принимает только известные ключи", () => {
    expectTypeOf<"app.name">().toExtend<MessageKey>();
    expectTypeOf<"app.unknown">().not.toExtend<MessageKey>();
  });

  it("3. текст кнопки запуска с { title: «Anki» } даёт «Запустить таймер: Anki» и «Start timer: Anki»", () => {
    const anki = { title: "Anki" };
    const startButtonKeys = keysRenderedAs("ru", "Запустить таймер: Anki", anki);

    expect(new Set(startButtonKeys.map((key) => t("en", key, anki)))).toEqual(
      new Set(["Start timer: Anki"]),
    );
  });
});
