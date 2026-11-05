import type { Locale } from "./locale.ts";
import { messages, type MessageKey } from "./messages.ts";

export type MessageParams = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

const FORM_SEPARATOR = "|";

const pluralForms: Record<Locale, Intl.LDMLPluralRule[]> = {
  ru: ["one", "few", "many"],
  en: ["one", "other"],
};

const pluralRules = new Map<Locale, Intl.PluralRules>();

export function t(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  return fill(messages[locale][key], params);
}

export function tc(
  locale: Locale,
  key: MessageKey,
  count: number,
  params: MessageParams = {},
): string {
  const forms = messages[locale][key].split(FORM_SEPARATOR);
  const form = forms[pluralFormIndex(locale, count)] ?? forms.at(-1) ?? "";
  return fill(form, { ...params, count });
}

function pluralFormIndex(locale: Locale, count: number): number {
  const category = rulesFor(locale).select(count);
  const index = pluralForms[locale].indexOf(category);
  return index === -1 ? pluralForms[locale].length - 1 : index;
}

function rulesFor(locale: Locale): Intl.PluralRules {
  const cached = pluralRules.get(locale);
  if (cached !== undefined) return cached;
  const rules = new Intl.PluralRules(locale);
  pluralRules.set(locale, rules);
  return rules;
}

function fill(template: string, params: MessageParams): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}
