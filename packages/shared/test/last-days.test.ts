import { describe, expect, it } from "vitest";
import { calendarWeek, lastDays, shiftDay } from "@stt/shared";

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

describe("границы местного дня", () => {
  it("1. неделя в Сантьяго заканчивается воскресеньем, даже если полуночи нет", () => {
    const zone = "America/Santiago";
    const saturday = "2026-09-06T03:30:00.000Z";
    const sunday = {
      from: "2026-09-06T04:00:00.000Z",
      to: "2026-09-07T03:00:00.000Z",
    };
    const week = calendarWeek(saturday, zone);

    expect(week.at(-2)?.to).toBe(sunday.from);
    expect(week.at(-1)).toEqual(sunday);
    expect(shiftDay(saturday, zone, 1)).toEqual(sunday);
    expect(lastDays(sunday.from, zone, 2)).toEqual(week.slice(-2));
  });

  it("1. сутки с двумя полуночами в Гаване начинаются с первой", () => {
    expect(shiftDay("2026-11-01T12:00:00.000Z", "America/Havana", 0)).toEqual({
      from: "2026-11-01T04:00:00.000Z",
      to: "2026-11-02T05:00:00.000Z",
    });
  });

  it("1. начало дня после перевода часов учитывает секунды", () => {
    expect(shiftDay("1972-01-07T12:00:00.000Z", "Africa/Monrovia", 0)).toEqual({
      from: "1972-01-07T00:44:30.000Z",
      to: "1972-01-08T00:00:00.000Z",
    });
  });
});
