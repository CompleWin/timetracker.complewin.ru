<script setup lang="ts">
import { Plus } from "@lucide/vue";
import {
  formatDate,
  formatDayMonth,
  formatDuration,
  formatWeekdayShort,
  type Session,
} from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
  groupByDay,
  isCurrentYear,
  relativeDay,
  totalSec,
  type RelativeDay,
  type SessionDay,
} from "../day-sessions.ts";
import { currentLocale } from "../i18n.ts";
import SessionRow from "./SessionRow.vue";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";

type DayGroup = {
  key: string;
  title: string;
  caption: string;
  total: string;
  sessions: Session[];
};

const props = defineProps<{
  sessions: Session[];
  active: boolean;
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{ add: []; edit: [session: Session] }>();

const { t } = useI18n();
const titleId = useId();

const relativeTitles = {
  today: "sessions.today",
  yesterday: "sessions.yesterday",
} as const satisfies Record<RelativeDay, string>;

const groups = computed<DayGroup[]>(() =>
  groupByDay(props.sessions, props.timeZone).map((day) => ({
    key: day.key,
    ...dayHeading(day),
    total: formatDuration(totalSec(day.sessions, props.now), currentLocale()),
    sessions: day.sessions,
  })),
);

function dayHeading(day: SessionDay<Session>): { title: string; caption: string } {
  const locale = currentLocale();
  const dayMonth = formatDayMonth(day.startedAt, props.timeZone, locale);
  const weekday = formatWeekdayShort(day.startedAt, props.timeZone, locale);
  const relative = relativeDay(day.startedAt, props.now, props.timeZone);
  if (relative !== undefined) {
    return {
      title: t(relativeTitles[relative]),
      caption: t("sessions.dayCaption", { date: dayMonth, weekday }),
    };
  }
  const title = isCurrentYear(day.startedAt, props.now, props.timeZone)
    ? dayMonth
    : formatDate(day.startedAt, props.timeZone, locale);
  return { title, caption: weekday };
}
</script>

<template>
  <AppIsland as="section" padding="none" :aria-labelledby="titleId" class="px-4 pt-4 pb-3 md:px-6">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 pb-1">
      <h2 :id="titleId" class="text-title">{{ t("sessions.title") }}</h2>
      <span class="text-meta text-fg-subtle">{{ t("sessions.newestFirst") }}</span>
      <AppButton
        v-if="active"
        variant="outline-primary"
        size="sm"
        class="ml-auto"
        @click="emit('add')"
      >
        <Plus :size="17" aria-hidden="true" />
        {{ t("sessions.add") }}
      </AppButton>
    </div>
    <p
      v-if="groups.length === 0"
      class="mt-2 border-t border-line pt-4 pb-3 text-body text-fg-subtle"
    >
      {{ active ? t("sessions.emptyActive") : t("sessions.empty") }}
    </p>
    <div v-for="group in groups" :key="group.key" class="mt-2">
      <div class="flex flex-wrap items-baseline gap-x-2.5 pt-2.5 pb-2">
        <h3 class="text-body font-semibold">{{ group.title }}</h3>
        <span class="text-meta text-fg-faint">{{ group.caption }}</span>
        <span class="ml-auto font-code text-meta text-fg-subtle">{{ group.total }}</span>
      </div>
      <ul>
        <SessionRow
          v-for="session in group.sessions"
          :key="session.id"
          :session
          :time-zone
          :now
          @edit="emit('edit', session)"
        />
      </ul>
    </div>
  </AppIsland>
</template>
