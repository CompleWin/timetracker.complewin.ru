<script setup lang="ts">
import { MoveDiagonal2 } from "@lucide/vue";
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import { sameSize, type PickerSize } from "../picker-size.ts";
import AppIconButton from "./ui/AppIconButton.vue";

type Drag = { x: number; y: number; from: PickerSize };

const KEY_STEP = 40;

const KEY_DELTAS = new Map<string, PickerSize>([
  ["ArrowRight", { width: KEY_STEP, listHeight: 0 }],
  ["ArrowLeft", { width: -KEY_STEP, listHeight: 0 }],
  ["ArrowDown", { width: 0, listHeight: KEY_STEP }],
  ["ArrowUp", { width: 0, listHeight: -KEY_STEP }],
]);

const IGNORED_KEYS = new Set(["Enter", " "]);

const props = defineProps<{ size: PickerSize }>();
const emit = defineEmits<{
  resize: [next: PickerSize, save: boolean];
  save: [];
  reset: [];
}>();

const { t } = useI18n();
const hintId = useId();
let drag: Drag | null = null;

function grow(delta: PickerSize): PickerSize {
  return {
    width: props.size.width + delta.width,
    listHeight: props.size.listHeight + delta.listHeight,
  };
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  drag = { x: event.clientX, y: event.clientY, from: props.size };
}

function moveDrag(event: PointerEvent): void {
  if (drag === null) return;
  const next = {
    width: drag.from.width + event.clientX - drag.x,
    listHeight: drag.from.listHeight + event.clientY - drag.y,
  };
  emit("resize", next, false);
}

function endDrag(): void {
  if (drag === null) return;
  const from = drag.from;
  drag = null;
  if (!sameSize(from, props.size)) emit("save");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Home") {
    event.preventDefault();
    emit("reset");
    return;
  }
  if (IGNORED_KEYS.has(event.key)) {
    event.preventDefault();
    return;
  }
  const delta = KEY_DELTAS.get(event.key);
  if (delta === undefined) return;
  event.preventDefault();
  emit("resize", grow(delta), true);
}
</script>

<template>
  <span class="ml-auto inline-flex">
    <AppIconButton
      :label="t('picker.resize')"
      size="sm"
      :aria-describedby="hintId"
      class="cursor-nwse-resize! touch-none select-none"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @dblclick="emit('reset')"
      @keydown="onKeydown"
    >
      <MoveDiagonal2 :size="17" aria-hidden="true" />
    </AppIconButton>
    <span :id="hintId" class="sr-only">{{ t("picker.resizeHint") }}</span>
  </span>
</template>
