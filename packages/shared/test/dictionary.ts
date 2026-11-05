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

export function hasValue(locale: Locale, key: string, value: string): boolean {
  return entriesOf(messages[locale]).some(([path, text]) => path === key && text === value);
}

function isNested(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
