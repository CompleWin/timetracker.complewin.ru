import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef } from "vue";
import {
  defaultPickerSize,
  fitPickerSize,
  forgetPickerSize,
  readStoredPickerSize,
  sameSize,
  storePickerSize,
  type PickerSize,
  type PickerViewport,
} from "./picker-size.ts";

export type PickerResize = {
  size: ComputedRef<PickerSize | null>;
  refresh: () => void;
  resize: (next: PickerSize, save: boolean) => void;
  save: () => void;
  reset: () => void;
};

export function usePickerResize(measure: () => PickerViewport | null): PickerResize {
  const stored = ref<PickerSize | null>(null);
  const viewport = ref<PickerViewport | null>(null);

  const size = computed(() => {
    const current = viewport.value;
    if (current === null) return null;
    return fitPickerSize(stored.value ?? defaultPickerSize(current), current);
  });

  onMounted(() => window.addEventListener("resize", remeasure));
  onBeforeUnmount(() => window.removeEventListener("resize", remeasure));

  function remeasure(): void {
    viewport.value = measure();
  }

  function refresh(): void {
    stored.value = readStoredPickerSize();
    remeasure();
  }

  function resize(next: PickerSize, saveNow: boolean): void {
    const current = size.value;
    const area = viewport.value;
    if (current === null || area === null) return;
    const fitted = fitPickerSize(next, area);
    if (sameSize(fitted, current)) return;
    stored.value = fitted;
    if (saveNow) save();
  }

  function save(): void {
    if (size.value !== null) storePickerSize(size.value);
  }

  function reset(): void {
    stored.value = null;
    forgetPickerSize();
  }

  return { size, refresh, resize, save, reset };
}
