import { describe, expect, it } from "vitest";
import { formatWeekdayDate, formatWeekdayShort, type Locale } from "@stt/shared";

type ByLocale = Record<Locale, string>;

const MOSCOW = "Europe/Moscow";
const NOV_3_AFTERNOON_IN_MOSCOW = "2026-11-03T12:42:00.000Z";
const NOV_4_AFTER_MIDNIGHT_IN_MOSCOW = "2026-11-03T21:30:00.000Z";

const weekNoonsInMoscow: [iso: string, ru: string, en: string][] = [
  ["2026-11-02T09:00:00.000Z", "пн", "Mon"],
  ["2026-11-03T09:00:00.000Z", "вт", "Tue"],
  ["2026-11-04T09:00:00.000Z", "ср", "Wed"],
  ["2026-11-05T09:00:00.000Z", "чт", "Thu"],
  ["2026-11-06T09:00:00.000Z", "пт", "Fri"],
  ["2026-11-07T09:00:00.000Z", "сб", "Sat"],
  ["2026-11-08T09:00:00.000Z", "вс", "Sun"],
];

function weekdayDate(iso: string, timeZone: string | null): ByLocale {
  return {
    ru: formatWeekdayDate(iso, timeZone, "ru"),
    en: formatWeekdayDate(iso, timeZone, "en"),
  };
}

describe("formatWeekdayDate", () => {
  it("9. 2026-11-03T12:42:00.000Z в Europe/Moscow даёт «вторник, 3 ноября» и «Tuesday, November 3»", () => {
    expect(weekdayDate(NOV_3_AFTERNOON_IN_MOSCOW, MOSCOW)).toEqual({
      ru: "вторник, 3 ноября",
      en: "Tuesday, November 3",
    });
  });

  it("9. 2026-11-03T21:30:00.000Z в Europe/Moscow уже «среда, 4 ноября»", () => {
    expect(weekdayDate(NOV_4_AFTER_MIDNIGHT_IN_MOSCOW, MOSCOW)).toEqual({
      ru: "среда, 4 ноября",
      en: "Wednesday, November 4",
    });
  });

  it("9. 2026-11-03T21:30:00.000Z с зоной null ещё «вторник, 3 ноября»", () => {
    expect(weekdayDate(NOV_4_AFTER_MIDNIGHT_IN_MOSCOW, null)).toEqual({
      ru: "вторник, 3 ноября",
      en: "Tuesday, November 3",
    });
  });
});

describe("formatWeekdayShort", () => {
  it.each(weekNoonsInMoscow)("10. %s в Europe/Moscow даёт «%s» и «%s»", (iso, ru, en) => {
    expect(formatWeekdayShort(iso, MOSCOW, "ru")).toBe(ru);
    expect(formatWeekdayShort(iso, MOSCOW, "en")).toBe(en);
  });
});
