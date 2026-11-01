import { en } from "./en.ts";
import type { Locale } from "./locale.ts";
import { ru } from "./ru.ts";

export type MessageKey = keyof typeof ru;

export type Messages = Record<MessageKey, string>;

export const messages: Record<Locale, Messages> = { ru, en };
