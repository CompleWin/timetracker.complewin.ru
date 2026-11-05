<script setup lang="ts">
import {
  formatDuration,
  formatShortDate,
  formatWeekdayShort,
  parallelSec,
  t as translate,
  tc,
  type DayRange,
  type Project,
  type SessionWithTask,
} from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { projectShares, startedIn, timelineItems, totalSec } from "../day-sessions.ts";
import { currentLocale } from "../i18n.ts";
import { shareClass } from "../project-colors.ts";
import AppDayBars, { type DayBar } from "./ui/AppDayBars.vue";
import AppIsland from "./ui/AppIsland.vue";

const PARALLEL_MIN_SEC = 60;

const props = defineProps<{
  weekSessions: SessionWithTask[];
  days: DayRange[];
  projects: Project[];
  now: number;
  timeZone: string | null;
}>();

const { t } = useI18n();
const titleId = useId();

const todaySessions = computed(() => {
  const today = props.days.at(-1);
  return today === undefined ? [] : startedIn(today, props.weekSessions);
});
const todaySec = computed(() => totalSec(todaySessions.value, props.now));
const total = computed(() => formatDuration(todaySec.value, currentLocale()));

const countLine = computed(() => {
  const locale = currentLocale();
  const sessions = tc(locale, "summary.sessions", todaySessions.value.length);
  const parallel = parallelSec(timelineItems(todaySessions.value, props.now));
  if (parallel < PARALLEL_MIN_SEC) return sessions;
  return translate(locale, "summary.parallel", {
    sessions,
    duration: formatDuration(parallel, locale),
  });
});

const bars = computed<DayBar[]>(() => {
  const locale = currentLocale();
  return props.days.map((day, index) => {
    const seconds = totalSec(startedIn(day, props.weekSessions), props.now);
    return {
      key: day.from,
      label: formatWeekdayShort(day.from, props.timeZone, locale),
      title: t("summary.day", {
        date: formatShortDate(day.from, props.timeZone, locale),
        duration: formatDuration(seconds, locale),
      }),
      seconds,
      today: index === props.days.length - 1,
    };
  });
});

const shares = computed(() => projectShares(todaySessions.value, props.projects, props.now));
</script>

<template>
  <AppIsland
    as="section"
    padding="none"
    :aria-labelledby="titleId"
    class="px-3.5 pt-4 pb-5 md:px-6"
  >
    <h2 :id="titleId" class="text-title">{{ t("summary.title") }}</h2>
    <div class="mt-3 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-metric">{{ total }}</p>
        <p class="mt-1.5 text-meta text-fg-subtle">{{ countLine }}</p>
      </div>
      <AppDayBars :bars />
    </div>
    <template v-if="todaySec > 0">
      <div class="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full">
        <span
          v-for="share in shares.filter((part) => part.seconds > 0)"
          :key="share.key"
          class="h-full"
          :class="shareClass(share.project?.color ?? null)"
          :style="{ flexGrow: share.seconds }"
        />
      </div>
      <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <li v-for="share in shares" :key="share.key" class="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            class="size-2 flex-none rounded-full"
            :class="shareClass(share.project?.color ?? null)"
          />
          <span class="text-meta text-fg-muted">{{
            share.project?.name ?? t("home.noProject")
          }}</span>
          <span class="font-code text-meta text-fg-subtle">
            {{ formatDuration(share.seconds, currentLocale()) }}
          </span>
        </li>
      </ul>
    </template>
  </AppIsland>
</template>
