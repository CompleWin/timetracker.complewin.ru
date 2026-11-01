import { describe, expect, it } from "vitest";
import { elapsedSec, formatClock, formatDuration, type Locale } from "@stt/shared";

const locales = ["ru", "en"] as const satisfies readonly Locale[];

const durationExamples: [sec: number, ru: string, en: string][] = [
  [0, "0 мин", "0 min"],
  [59, "0 мин", "0 min"],
  [60, "1 мин", "1 min"],
  [3599, "59 мин", "59 min"],
  [3600, "1 ч", "1 h"],
  [3660, "1 ч 1 мин", "1 h 1 min"],
  [45600, "12 ч 40 мин", "12 h 40 min"],
  [360000, "100 ч", "100 h"],
];

const clockExamples: [sec: number, clock: string][] = [
  [0, "0:00:00"],
  [59, "0:00:59"],
  [3661, "1:01:01"],
  [45605, "12:40:05"],
  [360000, "100:00:00"],
];

const invalidSeconds = [-1, NaN];

describe("formatDuration", () => {
  it.each(durationExamples)("1. %i секунд: «%s» в ru и «%s» в en", (sec, ru, en) => {
    expect(formatDuration(sec, "ru")).toBe(ru);
    expect(formatDuration(sec, "en")).toBe(en);
  });

  it.each(invalidSeconds)("1. %d бросает RangeError", (sec) => {
    for (const locale of locales) {
      expect(() => formatDuration(sec, locale)).toThrow(RangeError);
    }
  });
});

describe("formatClock", () => {
  it.each(clockExamples)("1. %i секунд дают %s", (sec, clock) => {
    expect(formatClock(sec)).toBe(clock);
  });

  it.each(invalidSeconds)("1. %d бросает RangeError", (sec) => {
    expect(() => formatClock(sec)).toThrow(RangeError);
  });
});

describe("elapsedSec", () => {
  const startedAt = "2026-01-01T00:00:00.000Z";

  it("2. через 90,5 секунды после старта даёт 90", () => {
    expect(elapsedSec(startedAt, Date.parse("2026-01-01T00:01:30.500Z"))).toBe(90);
  });

  it("2. если «сейчас» раньше старта, даёт 0", () => {
    expect(elapsedSec(startedAt, Date.parse("2025-12-31T23:59:00.000Z"))).toBe(0);
  });
});
