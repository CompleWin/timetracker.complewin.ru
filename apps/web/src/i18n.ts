import { isLocale, localeFromLanguage, messages, type Locale } from "@stt/shared";
import { createI18n } from "vue-i18n";

const LOCALE_STORAGE_KEY = "stt.locale";

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: "en",
  flatJson: true,
  messages,
});

export function currentLocale(): Locale {
  const locale = i18n.global.locale.value;
  return isLocale(locale) ? locale : "en";
}

export function applyLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
}

export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    return;
  }
}

function initialLocale(): Locale {
  const stored = storedLocale();
  return stored ?? localeFromLanguage(navigator.language);
}

function storedLocale(): Locale | undefined {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
