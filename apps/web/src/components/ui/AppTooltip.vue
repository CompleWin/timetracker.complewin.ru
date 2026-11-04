<script setup lang="ts">
import { CircleHelp } from "@lucide/vue";
import { onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppIconButton from "./AppIconButton.vue";

defineProps<{ subject: string; text: string }>();

const { t } = useI18n();
const tooltipId = useId();
const root = useTemplateRef<HTMLElement>("root");
const open = ref(false);

watch(open, (isOpen) => (isOpen ? listenForDismiss() : stopListening()));

onBeforeUnmount(stopListening);

function show(): void {
  open.value = true;
}

function hide(): void {
  open.value = false;
}

function showOnMouse(event: PointerEvent): void {
  if (event.pointerType === "mouse") show();
}

function hideOnMouse(event: PointerEvent): void {
  if (event.pointerType === "mouse") hide();
}

function hideOnPressOutside(event: PointerEvent): void {
  if (!(event.target instanceof Node && root.value?.contains(event.target))) hide();
}

function hideOnEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  hide();
}

function listenForDismiss(): void {
  document.addEventListener("pointerdown", hideOnPressOutside, true);
  document.addEventListener("keydown", hideOnEscape, true);
}

function stopListening(): void {
  document.removeEventListener("pointerdown", hideOnPressOutside, true);
  document.removeEventListener("keydown", hideOnEscape, true);
}
</script>

<template>
  <span ref="root" class="inline-flex">
    <AppIconButton
      size="xs"
      :label="t('tooltip.more', { subject })"
      :titled="false"
      :aria-describedby="tooltipId"
      @pointerenter="showOnMouse"
      @pointerleave="hideOnMouse"
      @focus="show"
      @blur="hide"
      @click="show"
    >
      <CircleHelp :size="15" aria-hidden="true" />
    </AppIconButton>
    <span
      v-show="open"
      :id="tooltipId"
      role="tooltip"
      class="absolute top-full left-0 z-10 mt-1 w-max max-w-64 rounded-field bg-surface-inverse px-3 py-2 text-meta text-fg-inverse shadow-popover"
    >
      {{ text }}
    </span>
  </span>
</template>
