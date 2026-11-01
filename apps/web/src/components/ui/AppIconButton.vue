<script setup lang="ts">
type IconButtonSize = "sm" | "md";

withDefaults(defineProps<{ label: string; size?: IconButtonSize }>(), { size: "md" });

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "size-8 max-md:size-11",
  md: "size-9 max-md:size-11",
};
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    class="inline-flex flex-none cursor-pointer items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-surface-page hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="sizeClasses[size]"
  >
    <slot />
  </button>
</template>
