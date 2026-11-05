<script setup lang="ts">
import {
  formatDuration,
  formatShortDate,
  formatWeekdayShort,
  tc,
  type DayRange,
  type Session,
} from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { startedIn, totalSec } from "../day-sessions.ts";
import { currentLocale } from "../i18n.ts";
import AppDayBars, { type DayBar } from "./ui/AppDayBars.vue";
import AppIsland from "./ui/AppIsland.vue";

const props = defineProps<{
  sessions: Session[];
  days: DayRange[];
  now: number;
  timeZone: string | null;
}>();

const { t } = useI18n();
const titleId = useId();

const bars = computed<DayBar[]>(() => {
  const locale = currentLocale();
  return props.days.map((day, index) => {
    const seconds = totalSec(startedIn(day, props.sessions), props.now);
    return {
      key: day.from,
      label: Array.from(formatWeekdayShort(day.from, props.timeZone, locale))[0] ?? "",
      title: t("summary.day", {
        date: formatShortDate(day.from, props.timeZone, locale),
        duration: formatDuration(seconds, locale),
      }),
      seconds,
      today: index === props.days.length - 1,
    };
  });
});

const rhythm = computed(() => {
  const locale = currentLocale();
  const activeDays = bars.value.filter((bar) => bar.seconds > 0).length;
  if (activeDays === 0) return t("byDay.empty");
  const sumSec = bars.value.reduce((sum, bar) => sum + bar.seconds, 0);
  return t("byDay.average", {
    days: tc(locale, "byDay.days", activeDays),
    duration: formatDuration(Math.floor(sumSec / activeDays), locale),
  });
});
</script>

<template>
  <AppIsland as="section" padding="none" :aria-labelledby="titleId" class="px-4 pt-4 pb-5 md:px-6">
    <div class="flex flex-wrap items-baseline gap-x-2.5">
      <h2 :id="titleId" class="text-title">{{ t("byDay.title") }}</h2>
      <span class="text-meta text-fg-subtle">{{ t("byDay.period") }}</span>
    </div>
    <AppDayBars :bars span="fortnight" class="mt-3.5" />
    <p class="mt-3.5 border-t border-line pt-3 text-meta text-fg-subtle">{{ rhythm }}</p>
  </AppIsland>
</template>
