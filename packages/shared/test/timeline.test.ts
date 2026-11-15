import { describe, expect, it } from "vitest";
import { parallelSec, timelineGaps, timelineLanes } from "@stt/shared";

type TimelineItem = { id: string; startMs: number; endMs: number };

const DAY = "2026-11-03";
const GAP_THRESHOLD_SEC = 1200;

function at(time: string): number {
  return Date.parse(`${DAY}T${time}:00.000Z`);
}

function item(id: string, start: string, end: string): TimelineItem {
  return { id, startMs: at(start), endMs: at(end) };
}

function gap(start: string, end: string): { startMs: number; endMs: number } {
  return { startMs: at(start), endMs: at(end) };
}

const a = item("A", "10:00", "11:00");
const b = item("B", "10:30", "11:30");
const c = item("C", "11:00", "12:00");
const d = item("D", "13:00", "13:30");

const gapExample = [
  item("1", "10:00", "11:00"),
  item("2", "10:30", "11:30"),
  item("3", "11:45", "12:00"),
  item("4", "12:30", "13:00"),
  item("5", "13:20", "13:40"),
];

describe("timelineLanes", () => {
  it("12. A 10:00–11:00, B 10:30–11:30, C 11:00–12:00, D 13:00–13:30 раскладываются по дорожкам", () => {
    expect(timelineLanes([a, b, c, d])).toEqual([
      { id: "A", lane: 0, lanes: 2 },
      { id: "B", lane: 1, lanes: 2 },
      { id: "C", lane: 0, lanes: 2 },
      { id: "D", lane: 0, lanes: 1 },
    ]);
  });

  it("12. результат идёт в порядке входа", () => {
    expect(timelineLanes([d, c, a, b])).toEqual([
      { id: "D", lane: 0, lanes: 1 },
      { id: "C", lane: 0, lanes: 2 },
      { id: "A", lane: 0, lanes: 2 },
      { id: "B", lane: 1, lanes: 2 },
    ]);
  });
});

describe("timelineGaps", () => {
  it("13. с порогом 1200 с пропуски 12:00–12:30 и 13:00–13:20, пауза 11:30–11:45 пропуском не считается", () => {
    expect(timelineGaps(gapExample, GAP_THRESHOLD_SEC)).toEqual([
      gap("12:00", "12:30"),
      gap("13:00", "13:20"),
    ]);
  });

  it("13. сессии берутся по startMs, порядок входа не важен", () => {
    expect(timelineGaps([...gapExample].reverse(), GAP_THRESHOLD_SEC)).toEqual([
      gap("12:00", "12:30"),
      gap("13:00", "13:20"),
    ]);
  });
});

describe("parallelSec", () => {
  it("14. 10:00–11:00, 10:30–11:30 и 10:45–11:00 дают 1800", () => {
    expect(
      parallelSec([
        item("1", "10:00", "11:00"),
        item("2", "10:30", "11:30"),
        item("3", "10:45", "11:00"),
      ]),
    ).toBe(1800);
  });

  it("14. 10:00–11:00 и 11:00–12:00 дают 0", () => {
    expect(parallelSec([item("1", "10:00", "11:00"), item("2", "11:00", "12:00")])).toBe(0);
  });

  it("14. одна сессия даёт 0", () => {
    expect(parallelSec([item("1", "10:00", "11:00")])).toBe(0);
  });
});
