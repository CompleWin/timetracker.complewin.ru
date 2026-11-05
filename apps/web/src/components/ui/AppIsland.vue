<script setup lang="ts">
type IslandPadding = "default" | "compact" | "none";

withDefaults(defineProps<{ as?: string; padding?: IslandPadding; accent?: boolean }>(), {
  as: "div",
  padding: "default",
  accent: false,
});

const paddingClasses: Record<IslandPadding, string> = {
  default: "p-[18px] md:p-7",
  compact: "p-4 md:p-5",
  none: "",
};
</script>

<template>
  <component
    :is="as"
    class="rounded-island bg-surface-island"
    :class="[paddingClasses[padding], accent ? 'border-2 border-primary' : 'border border-line']"
  >
    <slot />
  </component>
</template>
