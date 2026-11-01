<script setup lang="ts">
withDefaults(defineProps<{ as?: string; compact?: boolean; accent?: boolean }>(), {
  as: "div",
  compact: false,
  accent: false,
});
</script>

<template>
  <component
    :is="as"
    class="rounded-island bg-surface-island"
    :class="[
      compact ? 'p-4 md:p-5' : 'p-[18px] md:p-7',
      accent ? 'border-2 border-primary' : 'border border-line',
    ]"
  >
    <slot />
  </component>
</template>
