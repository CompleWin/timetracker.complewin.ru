export type PickerSize = { width: number; listHeight: number };

export type PickerViewport = { height: number; maxWidth: number };

type Range = { min: number; max: number };

type PickerLimits = { width: Range; listHeight: Range };

const STORAGE_KEY = "stt.pickerSize";
const MIN_WIDTH = 600;
const MIN_LIST_HEIGHT = 400;
const MIN_LIST_SHARE = 0.55;
const MAX_LIST_SHARE = 0.75;

export function defaultPickerSize(viewport: PickerViewport): PickerSize {
  const limits = pickerLimits(viewport);
  return { width: limits.width.max, listHeight: limits.listHeight.max };
}

export function fitPickerSize(size: PickerSize, viewport: PickerViewport): PickerSize {
  const limits = pickerLimits(viewport);
  return {
    width: clamp(size.width, limits.width),
    listHeight: clamp(size.listHeight, limits.listHeight),
  };
}

export function sameSize(left: PickerSize, right: PickerSize): boolean {
  return left.width === right.width && left.listHeight === right.listHeight;
}

export function readStoredPickerSize(): PickerSize | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : parsePickerSize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function storePickerSize(size: PickerSize): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    return;
  }
}

export function forgetPickerSize(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

function parsePickerSize(value: unknown): PickerSize | null {
  if (typeof value !== "object" || value === null) return null;
  const width: unknown = Reflect.get(value, "width");
  const listHeight: unknown = Reflect.get(value, "listHeight");
  if (!isPositiveInteger(width) || !isPositiveInteger(listHeight)) return null;
  return { width, listHeight };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function pickerLimits(viewport: PickerViewport): PickerLimits {
  const minListHeight = Math.min(MIN_LIST_HEIGHT, Math.floor(viewport.height * MIN_LIST_SHARE));
  return {
    width: { min: MIN_WIDTH, max: Math.max(MIN_WIDTH, Math.floor(viewport.maxWidth)) },
    listHeight: {
      min: minListHeight,
      max: Math.max(minListHeight, Math.floor(viewport.height * MAX_LIST_SHARE)),
    },
  };
}

function clamp(value: number, range: Range): number {
  return Math.round(Math.min(Math.max(value, range.min), range.max));
}
