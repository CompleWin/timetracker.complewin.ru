import { expect, type Locator, type Page } from "@playwright/test";
import { button, region } from "./ui.ts";

export type Point = { x: number; y: number };

export type Size = { width: number; height: number };

type Box = Point & Size;

export const PICKER_SIZE_KEY = "stt.pickerSize";

const PX_TOLERANCE = 1;
const DRAG_STEPS = 10;

export function pickerRegion(page: Page, name = "Выбор задачи"): Locator {
  return region(page, name);
}

export function resizeHandle(page: Page, name = "Изменить размер панели"): Locator {
  return button(page, name);
}

export async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (box === null) throw new Error("element has no bounding box");
  return box;
}

export function isInside(point: Point, box: Box): boolean {
  const insideX = point.x > box.x && point.x < box.x + box.width;
  const insideY = point.y > box.y && point.y < box.y + box.height;
  return insideX && insideY;
}

export async function leftEdge(locator: Locator): Promise<number> {
  return (await boxOf(locator)).x;
}

export async function rightEdge(locator: Locator): Promise<number> {
  const box = await boxOf(locator);
  return box.x + box.width;
}

export async function widthOf(locator: Locator): Promise<number> {
  return (await boxOf(locator)).width;
}

export async function panelWidth(page: Page): Promise<number> {
  return widthOf(pickerRegion(page));
}

export async function panelHeight(page: Page): Promise<number> {
  return (await boxOf(pickerRegion(page))).height;
}

export async function panelSize(page: Page): Promise<Size> {
  const { width, height } = await boxOf(pickerRegion(page));
  return { width, height };
}

export async function expectPx(measure: () => Promise<number>, expected: number): Promise<void> {
  await expect.poll(async () => snapped(await measure(), expected)).toBe(expected);
}

export async function expectPanelSize(page: Page, expected: Size): Promise<void> {
  await expectPx(() => panelWidth(page), expected.width);
  await expectPx(() => panelHeight(page), expected.height);
}

export async function scrollHandleIntoView(page: Page): Promise<void> {
  const handle = resizeHandle(page);
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeInViewport();
}

export async function handleCenter(page: Page): Promise<Point> {
  const box = await boxOf(resizeHandle(page));
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function dragHandleTo(page: Page, target: Point): Promise<void> {
  const start = await handleCenter(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: DRAG_STEPS });
  await page.mouse.up();
}

export async function dragHandleBy(page: Page, offset: Point): Promise<void> {
  const start = await handleCenter(page);
  await dragHandleTo(page, { x: start.x + offset.x, y: start.y + offset.y });
}

export function rawPickerSize(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), PICKER_SIZE_KEY);
}

export async function storedPickerSize(page: Page): Promise<unknown> {
  const raw = await rawPickerSize(page);
  return raw === null ? null : parseJson(raw);
}

export async function storePickerSize(page: Page, value: string): Promise<void> {
  await page.evaluate((entry) => localStorage.setItem(entry.key, entry.value), {
    key: PICKER_SIZE_KEY,
    value,
  });
}

function parseJson(raw: string): unknown {
  return JSON.parse(raw);
}

function snapped(actual: number, expected: number): number {
  return Math.abs(actual - expected) <= PX_TOLERANCE ? expected : actual;
}
