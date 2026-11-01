import { localeFromLanguage, type Locale } from "@stt/shared";

export function localeFromAcceptLanguage(header: string | undefined): Locale {
  const [preferred] = header?.split(",") ?? [];
  return localeFromLanguage(preferred);
}
