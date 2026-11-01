<script setup lang="ts">
withDefaults(defineProps<{ lines?: number }>(), { lines: 3 });

const LINE_WIDTHS = ["w-full", "w-[72%]", "w-[84%]"];

function lineWidth(line: number): string {
  return LINE_WIDTHS[(line - 1) % LINE_WIDTHS.length] ?? "w-full";
}
</script>

<template>
  <div class="flex flex-col gap-3.5" aria-hidden="true">
    <span
      v-for="line in lines"
      :key="line"
      class="h-3.5 rounded-full bg-surface-active"
      :class="lineWidth(line)"
    />
  </div>
</template>
