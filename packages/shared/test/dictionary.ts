import { messages, type Locale } from "@stt/shared";

export type Entry = [key: string, value: unknown];

export function entriesOf(dictionary: object, prefix = ""): Entry[] {
  return Object.entries(dictionary).flatMap(([key, value]): Entry[] => {
    const path = `${prefix}${key}`;
    return isNested(value) ? entriesOf(value, `${path}.`) : [[path, value]];
  });
}

export function keysOf(locale: Locale): string[] {
  return entriesOf(messages[locale])
    .map(([key]) => key)
    .sort();
}

export function keysWithValue(locale: Locale, matches: (value: string) => boolean): string[] {
  return entriesOf(messages[locale])
    .filter(([, value]) => typeof value === "string" && matches(value))
    .map(([key]) => key)
    .sort();
}

function isNested(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
