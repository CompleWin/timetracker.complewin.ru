<script setup lang="ts">
import { computed } from "vue";

export type DayBar = {
  key: string;
  label: string;
  title: string;
  seconds: number;
  today: boolean;
};

export type DayBarsSpan = "week" | "fortnight";

type SpanLayout = {
  row: string;
  track: string;
  bar: string;
};

const HOUR_SEC = 60 * 60;
const WEEK_MAX_HEIGHT_PX = 38;
const WEEK_MIN_HEIGHT_PX = 4;
const WEEK_SCALE_MIN_SEC = 8 * HOUR_SEC;
const FORTNIGHT_MAX_HEIGHT_PX = 64;
const FORTNIGHT_MIN_HEIGHT_PX = 8;
const FORTNIGHT_EMPTY_HEIGHT_PX = 4;
const FORTNIGHT_SCALE_SEC = 4 * HOUR_SEC;

const props = withDefaults(defineProps<{ bars: DayBar[]; span?: DayBarsSpan }>(), {
  span: "week",
});

const layouts: Record<DayBarsSpan, SpanLayout> = {
  week: { row: "gap-1.5", track: "h-[38px]", bar: "w-[14px]" },
  fortnight: { row: "justify-between", track: "h-16", bar: "w-3" },
};

const weekScaleSec = computed(() =>
  Math.max(WEEK_SCALE_MIN_SEC, ...props.bars.map((bar) => bar.seconds)),
);

const heightsPx: Record<DayBarsSpan, (seconds: number) => number> = {
  week: (seconds) =>
    Math.max(WEEK_MIN_HEIGHT_PX, Math.round((seconds / weekScaleSec.value) * WEEK_MAX_HEIGHT_PX)),
  fortnight: (seconds) => {
    if (seconds === 0) return FORTNIGHT_EMPTY_HEIGHT_PX;
    const height = Math.round((seconds / FORTNIGHT_SCALE_SEC) * FORTNIGHT_MAX_HEIGHT_PX);
    return Math.min(FORTNIGHT_MAX_HEIGHT_PX, Math.max(FORTNIGHT_MIN_HEIGHT_PX, height));
  },
};

const layout = computed(() => layouts[props.span]);

function heightOf(bar: DayBar): string {
  return `${heightsPx[props.span](bar.seconds)}px`;
}

function fillOf(bar: DayBar): string {
  if (bar.today) return "bg-primary";
  return bar.seconds > 0 ? "bg-primary-muted" : "bg-surface-active";
}
</script>

<template>
  <div class="flex items-end" :class="layout.row">
    <div v-for="bar in bars" :key="bar.key" class="flex flex-col items-center gap-1">
      <div class="flex items-end" :class="layout.track">
        <span
          :title="bar.title"
          class="block rounded-full"
          :class="[layout.bar, fillOf(bar)]"
          :style="{ height: heightOf(bar) }"
        />
      </div>
      <span class="text-caps uppercase" :class="bar.today ? 'text-fg' : 'text-fg-faint'">
        {{ bar.label }}
      </span>
    </div>
  </div>
</template>
