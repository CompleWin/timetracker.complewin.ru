<script setup lang="ts">
import {
  formatDuration,
  formatShortDate,
  formatWeekdayShort,
  t as translate,
  tc,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../../i18n.ts";
import {
  DEMO_TIME_ZONE,
  demoWeek,
  parallelSec,
  PROJECT_COLORS,
  PROJECT_NAMES,
  projectShares,
  totalSec,
  type DemoSession,
} from "../../landing-demo.ts";
import { shareClass } from "../../project-colors.ts";
import AppDayBars, { type DayBar } from "../ui/AppDayBars.vue";

const PARALLEL_MIN_SEC = 60;

const props = defineProps<{ sessions: DemoSession[] }>();

const { t } = useI18n();

const todaySec = computed(() => totalSec(props.sessions));
const total = computed(() => formatDuration(todaySec.value, currentLocale()));

const countLine = computed(() => {
  const locale = currentLocale();
  const sessions = tc(locale, "summary.sessions", props.sessions.length);
  const parallel = parallelSec(props.sessions);
  if (parallel < PARALLEL_MIN_SEC) return sessions;
  return translate(locale, "summary.parallel", {
    sessions,
    duration: formatDuration(parallel, locale),
  });
});

const bars = computed<DayBar[]>(() => {
  const locale = currentLocale();
  return demoWeek(todaySec.value).map((day) => ({
    key: day.iso,
    label: formatWeekdayShort(day.iso, DEMO_TIME_ZONE, locale),
    title: t("summary.day", {
      date: formatShortDate(day.iso, DEMO_TIME_ZONE, locale),
      duration: formatDuration(day.seconds, locale),
    }),
    seconds: day.seconds,
    today: day.today,
  }));
});

const shares = computed(() => projectShares(props.sessions));
</script>

<template>
  <div class="rounded-island border border-line bg-surface-island px-6 pt-4 pb-5">
    <p class="text-title">{{ t("summary.title") }}</p>
    <div class="mt-3 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-metric whitespace-nowrap">{{ total }}</p>
        <p class="mt-1.5 text-meta text-fg-subtle">{{ countLine }}</p>
      </div>
      <AppDayBars :bars />
    </div>
    <div class="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full">
      <span
        v-for="share in shares"
        :key="share.project"
        class="h-full basis-0 [transition:flex-grow_300ms]"
        :class="shareClass(PROJECT_COLORS[share.project])"
        :style="{ flexGrow: Math.max(1, Math.round(share.seconds / 60)) }"
      />
    </div>
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      <li v-for="share in shares" :key="share.project" class="flex items-center gap-1.5">
        <span
          class="size-2 flex-none rounded-full"
          :class="shareClass(PROJECT_COLORS[share.project])"
        />
        <span class="text-meta text-fg-muted">{{ t(PROJECT_NAMES[share.project]) }}</span>
        <span class="font-code text-meta text-fg-subtle">
          {{ formatDuration(share.seconds, currentLocale()) }}
        </span>
      </li>
    </ul>
  </div>
</template>
