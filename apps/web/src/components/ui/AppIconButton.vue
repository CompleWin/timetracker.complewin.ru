<script setup lang="ts">
type IconButtonSize = "sm" | "md";

withDefaults(defineProps<{ label: string; size?: IconButtonSize; pressed?: boolean }>(), {
  size: "md",
  pressed: false,
});

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "size-8 max-md:size-11",
  md: "size-9 max-md:size-11",
};

const CALM_TONE = "text-fg-subtle hover:bg-surface-page hover:text-fg";

const PRESSED_TONE = "bg-primary-soft text-primary hover:bg-primary-soft-hover";
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    class="inline-flex flex-none cursor-pointer items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="[sizeClasses[size], pressed ? PRESSED_TONE : CALM_TONE]"
  >
    <slot />
  </button>
</template>
