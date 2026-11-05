import { describe, expect, it } from "vitest";
import { formatDayMonth, type Locale } from "@stt/shared";

type ByLocale = Record<Locale, string>;

const MOSCOW = "Europe/Moscow";
const OCT_31_AFTERNOON_IN_MOSCOW = "2026-10-31T11:32:00.000Z";
const NOV_1_AFTER_MIDNIGHT_IN_MOSCOW = "2026-10-31T21:05:00.000Z";

function dayMonthInMoscow(iso: string): ByLocale {
  return {
    ru: formatDayMonth(iso, MOSCOW, "ru"),
    en: formatDayMonth(iso, MOSCOW, "en"),
  };
}

describe("formatDayMonth", () => {
  it("1. 2026-10-31T11:32:00.000Z в Europe/Moscow даёт «31 октября» и «October 31»", () => {
    expect(dayMonthInMoscow(OCT_31_AFTERNOON_IN_MOSCOW)).toEqual({
      ru: "31 октября",
      en: "October 31",
    });
  });

  it("1. 2026-10-31T21:05:00.000Z в Europe/Moscow уже «1 ноября» и «November 1»", () => {
    expect(dayMonthInMoscow(NOV_1_AFTER_MIDNIGHT_IN_MOSCOW)).toEqual({
      ru: "1 ноября",
      en: "November 1",
    });
  });
});
