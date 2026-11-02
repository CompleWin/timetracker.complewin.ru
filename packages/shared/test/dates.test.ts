import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatSessionRange,
  formatShortDate,
  formatTime,
  type Locale,
} from "@stt/shared";

type ByLocale = Record<Locale, string>;

const MOSCOW = "Europe/Moscow";
const AFTERNOON_IN_MOSCOW = "2026-10-31T11:32:00.000Z";
const AFTER_MIDNIGHT_IN_MOSCOW = "2026-10-31T21:05:00.000Z";
const AFTERNOON_IN_UTC = "2026-10-31T13:05:00.000Z";

function inBothLocales(format: (locale: Locale) => string): ByLocale {
  return { ru: format("ru"), en: format("en") };
}

function sessionRange(startedAt: string, endedAt: string, timeZone: string | null): ByLocale {
  return inBothLocales((locale) => formatSessionRange(startedAt, endedAt, timeZone, locale));
}

describe("formatDateTime, formatShortDate, formatDate и formatTime", () => {
  it("17. 2026-10-31T11:32:00.000Z в Europe/Moscow: formatDateTime даёт «31.10.2026 14:32» и «Oct 31, 2026 14:32»", () => {
    expect(inBothLocales((locale) => formatDateTime(AFTERNOON_IN_MOSCOW, MOSCOW, locale))).toEqual({
      ru: "31.10.2026 14:32",
      en: "Oct 31, 2026 14:32",
    });
  });

  it("17. 2026-10-31T11:32:00.000Z в Europe/Moscow: formatShortDate даёт «31.10» и «Oct 31»", () => {
    expect(inBothLocales((locale) => formatShortDate(AFTERNOON_IN_MOSCOW, MOSCOW, locale))).toEqual(
      { ru: "31.10", en: "Oct 31" },
    );
  });

  it("17. 2026-10-31T11:32:00.000Z в Europe/Moscow: formatDate даёт «31.10.2026» и «Oct 31, 2026», formatTime — «14:32»", () => {
    expect(inBothLocales((locale) => formatDate(AFTERNOON_IN_MOSCOW, MOSCOW, locale))).toEqual({
      ru: "31.10.2026",
      en: "Oct 31, 2026",
    });
    expect(formatTime(AFTERNOON_IN_MOSCOW, MOSCOW)).toBe("14:32");
  });
});

describe("часовой пояс и 24-часовое время", () => {
  it("18. 2026-10-31T21:05:00.000Z в Europe/Moscow уже 1 ноября: formatDate даёт «01.11.2026»", () => {
    expect(formatDate(AFTER_MIDNIGHT_IN_MOSCOW, MOSCOW, "ru")).toBe("01.11.2026");
    expect(formatDate(AFTER_MIDNIGHT_IN_MOSCOW, MOSCOW, "en")).toBe("Nov 1, 2026");
  });

  it("18. с зоной null это ещё 31 октября: formatDate даёт «31.10.2026»", () => {
    expect(inBothLocales((locale) => formatDate(AFTER_MIDNIGHT_IN_MOSCOW, null, locale))).toEqual({
      ru: "31.10.2026",
      en: "Oct 31, 2026",
    });
  });

  it("18. formatShortDate 1 ноября по Москве даёт «01.11» и «Nov 1»", () => {
    expect(
      inBothLocales((locale) => formatShortDate(AFTER_MIDNIGHT_IN_MOSCOW, MOSCOW, locale)),
    ).toEqual({ ru: "01.11", en: "Nov 1" });
  });

  it("18. после полуночи по Москве formatTime даёт «00:05», с зоной null — «21:05»", () => {
    expect(formatTime(AFTER_MIDNIGHT_IN_MOSCOW, MOSCOW)).toBe("00:05");
    expect(formatTime(AFTER_MIDNIGHT_IN_MOSCOW, null)).toBe("21:05");
  });

  it("18. часы 24-часовые без AM/PM в обоих языках", () => {
    expect(formatTime(AFTERNOON_IN_UTC, null)).toBe("13:05");
    expect(inBothLocales((locale) => formatDateTime(AFTERNOON_IN_UTC, null, locale))).toEqual({
      ru: "31.10.2026 13:05",
      en: "Oct 31, 2026 13:05",
    });
  });
});

describe("formatSessionRange", () => {
  it("19. 20:30Z–21:15Z 31 октября в Europe/Moscow даёт «23:30–01.11 00:15» и «23:30–Nov 1 00:15»", () => {
    expect(sessionRange("2026-10-31T20:30:00.000Z", "2026-10-31T21:15:00.000Z", MOSCOW)).toEqual({
      ru: "23:30–01.11 00:15",
      en: "23:30–Nov 1 00:15",
    });
  });

  it("19. 11:00Z–11:40Z 31 октября в Europe/Moscow даёт «14:00–14:40»", () => {
    expect(sessionRange("2026-10-31T11:00:00.000Z", "2026-10-31T11:40:00.000Z", MOSCOW)).toEqual({
      ru: "14:00–14:40",
      en: "14:00–14:40",
    });
  });

  it("19. сутки определяются в часовом поясе: 20:30Z–21:15Z с зоной null укладываются в одни сутки", () => {
    expect(sessionRange("2026-10-31T20:30:00.000Z", "2026-10-31T21:15:00.000Z", null)).toEqual({
      ru: "20:30–21:15",
      en: "20:30–21:15",
    });
  });

  it("19. сутки определяются в часовом поясе: 23:30Z–00:15Z по Москве укладываются в одни сутки", () => {
    expect(sessionRange("2026-10-31T23:30:00.000Z", "2026-11-01T00:15:00.000Z", MOSCOW)).toEqual({
      ru: "02:30–03:15",
      en: "02:30–03:15",
    });
  });
});
