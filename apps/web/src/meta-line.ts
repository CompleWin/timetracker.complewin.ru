import { t, type Locale } from "@stt/shared";

export function joinMeta(locale: Locale, parts: string[]): string {
  return parts.join(` ${t(locale, "meta.separator")} `);
}
