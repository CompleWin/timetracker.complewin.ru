<script setup lang="ts">
type DotSize = 8 | 10;

withDefaults(defineProps<{ size?: DotSize }>(), { size: 10 });

const sizeClasses: Record<DotSize, string> = {
  8: "size-2",
  10: "size-2.5",
};
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-block flex-none rounded-full bg-primary motion-safe:animate-pulse-dot"
    :class="sizeClasses[size]"
  />
</template>
