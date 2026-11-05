<script setup lang="ts">
import { computed } from "vue";

export type DayBar = {
  key: string;
  label: string;
  title: string;
  seconds: number;
  today: boolean;
};

const BAR_MAX_HEIGHT_PX = 38;
const BAR_MIN_HEIGHT_PX = 4;
const SCALE_MIN_SEC = 8 * 60 * 60;

const props = defineProps<{ bars: DayBar[] }>();

const scaleSec = computed(() => Math.max(SCALE_MIN_SEC, ...props.bars.map((bar) => bar.seconds)));

function heightOf(bar: DayBar): string {
  const height = Math.round((bar.seconds / scaleSec.value) * BAR_MAX_HEIGHT_PX);
  return `${Math.max(BAR_MIN_HEIGHT_PX, height)}px`;
}

function fillOf(bar: DayBar): string {
  if (bar.today) return "bg-primary";
  return bar.seconds > 0 ? "bg-primary-muted" : "bg-surface-active";
}
</script>

<template>
  <div class="flex items-end gap-1.5">
    <div v-for="bar in bars" :key="bar.key" class="flex flex-col items-center gap-1">
      <div class="flex h-[38px] items-end">
        <span
          :title="bar.title"
          class="block w-[14px] rounded-full"
          :class="fillOf(bar)"
          :style="{ height: heightOf(bar) }"
        />
      </div>
      <span class="text-caps uppercase" :class="bar.today ? 'text-fg' : 'text-fg-faint'">
        {{ bar.label }}
      </span>
    </div>
  </div>
</template>
