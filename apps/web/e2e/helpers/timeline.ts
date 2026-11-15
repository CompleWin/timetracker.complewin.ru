import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import { localTime, type AfternoonZone } from "./afternoon.ts";
import { boxOf } from "./picker-size.ts";
import { button, island, region, textOf } from "./ui.ts";

export type Span = { top: number; bottom: number };

export type HourMark = Span & { text: string };

const HOURS_PER_DAY = 24;
const HALF_DAY_HOURS = 12;
const HOUR_MARK = /^\d{2}:00$/;
const SUBPIXEL_PX = 0.5;
const MINUTE_MS = 60_000;

export const DAY_MARKS = [
  ...Array.from({ length: HOURS_PER_DAY }, (_, hour) => `${String(hour).padStart(2, "0")}:00`),
  "00:00",
];

export function zoneAtHour(localHour: number, nowMs: number = Date.now()): AfternoonZone {
  const eastward = (localHour - new Date(nowMs).getUTCHours() + HOURS_PER_DAY) % HOURS_PER_DAY;
  const offsetHours = eastward > HALF_DAY_HOURS ? eastward - HOURS_PER_DAY : eastward;
  return { timezoneId: etcZoneName(offsetHours), offsetHours };
}

export async function waitPastFullHour(): Promise<void> {
  if (new Date().getUTCMinutes() !== 0) return;
  test.slow();
  await expect.poll(() => new Date().getUTCMinutes(), { timeout: 2 * MINUTE_MS }).not.toBe(0);
}

export function timeline(page: Page): Locator {
  return island(page, "Хронология");
}

export function timeScale(page: Page): Locator {
  return region(page, "Шкала времени");
}

export function sessionBlock(page: Page, title: string, range: string): Locator {
  return button(page, `Изменить сессию ${title}, ${range}`);
}

export function fillGapButton(page: Page, range: string): Locator {
  return button(page, `Заполнить пропуск ${range}`);
}

export function nowLine(page: Page, zone: AfternoonZone): Locator {
  return textOf(timeScale(page), localTime(zone, new Date().toISOString()));
}

export async function hourMarks(page: Page): Promise<HourMark[]> {
  const marks = timeScale(page).getByText(HOUR_MARK).filter({ visible: true });
  const rects = await marks.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent?.trim() ?? "", top: rect.top, bottom: rect.bottom };
    }),
  );
  return rects.sort((above, below) => above.top - below.top);
}

export async function hourMarkTexts(page: Page): Promise<string[]> {
  const marks = await hourMarks(page);
  return marks.map((mark) => mark.text);
}

export async function firstHourMark(page: Page): Promise<HourMark> {
  return markAt(await hourMarks(page), 0);
}

export async function lastHourMark(page: Page): Promise<HourMark> {
  return markAt(await hourMarks(page), -1);
}

export async function spanOf(locator: Locator): Promise<Span> {
  const box = await boxOf(locator);
  return { top: box.y, bottom: box.y + box.height };
}

export function middleOf(span: Span): number {
  return (span.top + span.bottom) / 2;
}

export async function expectShownInScale(page: Page, item: Span): Promise<void> {
  const scale = await spanOf(timeScale(page));
  expect(item.top).toBeGreaterThanOrEqual(scale.top - SUBPIXEL_PX);
  expect(item.bottom).toBeLessThanOrEqual(scale.bottom + SUBPIXEL_PX);
}

export async function expectNowLineShownInScale(page: Page, zone: AfternoonZone): Promise<void> {
  await expect(async () => {
    await expectShownInScale(page, await spanOf(nowLine(page, zone)));
  }).toPass();
}

export async function expectFirstMarkShownInScale(page: Page): Promise<void> {
  await expect(async () => {
    const mark = await firstHourMark(page);
    expect(mark.text).toBe("00:00");
    await expectShownInScale(page, mark);
  }).toPass();
}

export async function expectLastMarkShownInScale(page: Page): Promise<void> {
  await expect(async () => {
    const mark = await lastHourMark(page);
    expect(mark.text).toBe("00:00");
    await expectShownInScale(page, mark);
  }).toPass();
}

export function scaleScrollTop(page: Page): Promise<number> {
  return timeScale(page).evaluate((element) => element.scrollTop);
}

export async function waitForOpeningScroll(page: Page): Promise<void> {
  await expect.poll(() => scaleScrollTop(page)).toBeGreaterThan(0);
}

export async function scrollScaleToStart(page: Page): Promise<void> {
  await timeScale(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => scaleScrollTop(page)).toBe(0);
}

export function nextApiRead(page: Page, timeout: number): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && new URL(response.url()).pathname.startsWith("/api/"),
    { timeout },
  );
}

export async function returnToTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new FocusEvent("focus"));
  });
}

export async function afterNextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

export async function dashedFrameTop(inside: Locator): Promise<number> {
  await expect(inside).toBeVisible();
  return inside.evaluate((element) => {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      const lineStyles = [
        style.borderTopStyle,
        style.borderRightStyle,
        style.borderBottomStyle,
        style.borderLeftStyle,
        style.outlineStyle,
      ];
      if (lineStyles.includes("dashed")) return node.getBoundingClientRect().top;
    }
    throw new Error("no dashed frame around the element");
  });
}

function markAt(marks: HourMark[], index: number): HourMark {
  const mark = marks.at(index);
  if (mark === undefined) throw new Error("no hour marks on the time scale");
  return mark;
}

function etcZoneName(offsetHours: number): string {
  if (offsetHours === 0) return "Etc/GMT";
  const sign = offsetHours > 0 ? "-" : "+";
  return `Etc/GMT${sign}${Math.abs(offsetHours)}`;
}
