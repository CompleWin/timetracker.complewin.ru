<script setup lang="ts">
withDefaults(defineProps<{ as?: string; compact?: boolean }>(), { as: "div", compact: false });
</script>

<template>
  <component
    :is="as"
    class="rounded-island border border-line bg-surface-island"
    :class="compact ? 'p-4 md:p-5' : 'p-[18px] md:p-7'"
  >
    <slot />
  </component>
</template>
