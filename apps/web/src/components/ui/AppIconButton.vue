<script setup lang="ts">
export type IconButtonSize = "xs" | "sm" | "md" | "toolbar" | "lg" | "xl" | "2xl";

export type IconButtonTone = "calm" | "stop" | "start" | "outlined";

withDefaults(
  defineProps<{
    label: string;
    size?: IconButtonSize;
    tone?: IconButtonTone;
    pressed?: boolean;
    titled?: boolean;
  }>(),
  { size: "md", tone: "calm", pressed: false, titled: true },
);

const sizeClasses: Record<IconButtonSize, string> = {
  xs: "relative size-[26px] max-md:after:absolute max-md:after:-inset-[9px]",
  sm: "size-8 max-md:size-11",
  md: "size-9 max-md:size-11",
  toolbar: "size-[38px] max-md:size-11",
  lg: "size-[46px]",
  xl: "size-12",
  "2xl": "size-[52px]",
};

const toneClasses: Record<IconButtonTone, string> = {
  calm: "text-fg-subtle hover:bg-surface-page hover:text-fg",
  stop: "border-2 border-fg text-fg hover:bg-fg hover:text-surface-page",
  start: "bg-primary text-white hover:bg-primary-hover",
  outlined: "border border-line-strong text-primary hover:bg-primary-soft",
};

const PRESSED_TONE = "bg-primary-soft text-primary hover:bg-primary-soft-hover";
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="titled ? label : undefined"
    class="inline-flex flex-none cursor-pointer items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
    :class="[sizeClasses[size], pressed ? PRESSED_TONE : toneClasses[tone]]"
  >
    <slot />
  </button>
</template>
