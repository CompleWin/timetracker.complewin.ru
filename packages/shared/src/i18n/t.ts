import type { Locale } from "./locale.ts";
import { messages, type MessageKey } from "./messages.ts";

export type MessageParams = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

export function t(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  return messages[locale][key].replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}
