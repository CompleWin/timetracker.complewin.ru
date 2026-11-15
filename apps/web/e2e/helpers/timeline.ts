import { expect, type Locator, type Page } from "@playwright/test";
import { localTime, type AfternoonZone } from "./afternoon.ts";
import { boxOf } from "./picker-size.ts";
import { button, island } from "./ui.ts";

const HOURS_PER_DAY = 24;
const HALF_DAY_HOURS = 12;
const HOUR_MARK = /^\d{2}:00$/;

type MarkRect = {
  text: string;
  top: number;
  bottom: number;
};

export function zoneAtHour(localHour: number, nowMs: number = Date.now()): AfternoonZone {
  const eastward = (localHour - new Date(nowMs).getUTCHours() + HOURS_PER_DAY) % HOURS_PER_DAY;
  const offsetHours = eastward > HALF_DAY_HOURS ? eastward - HOURS_PER_DAY : eastward;
  return { timezoneId: etcZoneName(offsetHours), offsetHours };
}

export function localClockNow(zone: AfternoonZone): string {
  return localTime(zone, new Date().toISOString());
}

export function timeline(page: Page): Locator {
  return island(page, "Хронология");
}

export function sessionBlock(page: Page, title: string, range: string): Locator {
  return button(page, `Изменить сессию ${title}, ${range}`);
}

export function fillGapButton(page: Page, range: string): Locator {
  return button(page, `Заполнить пропуск ${range}`);
}

export async function hourMarksTopToBottom(page: Page): Promise<string[]> {
  const marks = await markRects(page);
  return marks.sort((above, below) => above.top - below.top).map((mark) => mark.text);
}

export async function firstHourMark(page: Page): Promise<string | undefined> {
  const marks = await hourMarksTopToBottom(page);
  return marks.at(0);
}

export async function lastHourMark(page: Page): Promise<string | undefined> {
  const marks = await hourMarksTopToBottom(page);
  return marks.at(-1);
}

export async function expectWithinScale(page: Page, item: Locator): Promise<void> {
  const marks = await markRects(page);
  const scaleTop = Math.min(...marks.map((mark) => mark.top));
  const scaleBottom = Math.max(...marks.map((mark) => mark.bottom));
  const box = await boxOf(item);
  expect(box.y + box.height).toBeGreaterThanOrEqual(scaleTop);
  expect(box.y).toBeLessThanOrEqual(scaleBottom);
}

export async function bottomOf(locator: Locator): Promise<number> {
  const box = await boxOf(locator);
  return box.y + box.height;
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

function markRects(page: Page): Promise<MarkRect[]> {
  const marks = timeline(page).getByText(HOUR_MARK).filter({ visible: true });
  return marks.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent?.trim() ?? "", top: rect.top, bottom: rect.bottom };
    }),
  );
}

function etcZoneName(offsetHours: number): string {
  if (offsetHours === 0) return "Etc/GMT";
  const sign = offsetHours > 0 ? "-" : "+";
  return `Etc/GMT${sign}${Math.abs(offsetHours)}`;
}
