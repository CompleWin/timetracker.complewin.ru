export const locales = ["ru", "en"] as const;

export type Locale = (typeof locales)[number];

export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value);
}

export function localeFromLanguage(languageTag: string | null | undefined): Locale {
  return languageTag?.trim().toLowerCase().startsWith("ru") ? "ru" : "en";
}
