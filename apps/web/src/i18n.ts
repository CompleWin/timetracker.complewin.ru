import { localeFromLanguage, messages } from "@stt/shared";
import { createI18n } from "vue-i18n";

export const i18n = createI18n({
  legacy: false,
  locale: localeFromLanguage(navigator.language),
  fallbackLocale: "en",
  flatJson: true,
  messages,
});
