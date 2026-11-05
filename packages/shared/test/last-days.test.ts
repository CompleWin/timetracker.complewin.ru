import { describe, expect, it } from "vitest";
import { lastDays } from "@stt/shared";

describe("lastDays", () => {
  it("11. двое суток по Москве до 2026-11-03T12:42:00.000Z", () => {
    expect(lastDays("2026-11-03T12:42:00.000Z", "Europe/Moscow", 2)).toEqual([
      { from: "2026-11-01T21:00:00.000Z", to: "2026-11-02T21:00:00.000Z" },
      { from: "2026-11-02T21:00:00.000Z", to: "2026-11-03T21:00:00.000Z" },
    ]);
  });

  it("11. сутки перехода на летнее время в Europe/Berlin короче 24 часов", () => {
    expect(lastDays("2026-03-30T10:00:00.000Z", "Europe/Berlin", 2)).toEqual([
      { from: "2026-03-28T23:00:00.000Z", to: "2026-03-29T22:00:00.000Z" },
      { from: "2026-03-29T22:00:00.000Z", to: "2026-03-30T22:00:00.000Z" },
    ]);
  });

  it("11. с зоной null сутки считаются в UTC", () => {
    expect(lastDays("2026-11-03T23:30:00.000Z", null, 1)).toEqual([
      { from: "2026-11-03T00:00:00.000Z", to: "2026-11-04T00:00:00.000Z" },
    ]);
  });
});
