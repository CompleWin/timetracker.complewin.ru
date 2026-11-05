<script setup lang="ts">
import { Plus } from "@lucide/vue";
import {
  formatDuration,
  formatTime,
  formatWeekdayDate,
  timelineGaps,
  timelineLanes,
  timelineRange,
  type DayRange,
  type Project,
  type SessionWithTask,
  type TimelineGap,
} from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { isOnline } from "../connection.ts";
import { timelineItems } from "../day-sessions.ts";
import { currentLocale } from "../i18n.ts";
import type { SessionRange } from "./SessionDialog.vue";
import TimelineSession from "./TimelineSession.vue";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";

type PlacedSession = {
  session: SessionWithTask;
  style: Record<string, string>;
  heightPx: number;
};

type PlacedGap = {
  key: string;
  range: SessionRange;
  label: string;
  fillLabel: string;
  style: Record<string, string>;
};

const HOUR_HEIGHT_PX = 64;
const HOUR_MS = 60 * 60 * 1000;
const GAP_MIN_SEC = 20 * 60;
const MS_PER_SECOND = 1000;
const BLOCK_MIN_HEIGHT_PX = 24;
const BLOCK_INSET_PX = 3;
const SCALE_LABEL_WIDTH = "56px";

const props = defineProps<{
  sessions: SessionWithTask[];
  day: DayRange;
  projects: Map<string, Project>;
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{
  add: [];
  edit: [session: SessionWithTask];
  fill: [range: SessionRange];
}>();

const { t } = useI18n();
const titleId = useId();

const nowIso = computed(() => new Date(props.now).toISOString());
const dateLabel = computed(() =>
  formatWeekdayDate(props.day.from, props.timeZone, currentLocale()),
);
const hours = computed(() =>
  timelineRange(props.sessions[0]?.startedAt ?? null, nowIso.value, props.timeZone),
);
const scaleHeight = computed(() => (hours.value.endHour - hours.value.startHour) * HOUR_HEIGHT_PX);
const hourMarks = computed(() =>
  Array.from({ length: hours.value.endHour - hours.value.startHour + 1 }, (_, index) => ({
    label: `${String(hours.value.startHour + index).padStart(2, "0")}:00`,
    top: index * HOUR_HEIGHT_PX,
  })),
);
const items = computed(() => timelineItems(props.sessions, props.now));

const placedSessions = computed<PlacedSession[]>(() => {
  const lanes = new Map(timelineLanes(items.value).map((lane) => [lane.id, lane]));
  return props.sessions.map((session, index) => {
    const item = items.value[index];
    const lane = lanes.get(session.id) ?? { lane: 0, lanes: 1 };
    const top = offsetOf(item?.startMs ?? 0);
    const bottom = Math.min(offsetOf(item?.endMs ?? 0), scaleHeight.value);
    const heightPx = Math.max(BLOCK_MIN_HEIGHT_PX, bottom - top - BLOCK_INSET_PX);
    return {
      session,
      heightPx,
      style: {
        top: `${top + 1}px`,
        height: `${heightPx}px`,
        left: `calc(${SCALE_LABEL_WIDTH} + (100% - ${SCALE_LABEL_WIDTH}) * ${lane.lane} / ${lane.lanes})`,
        width: `calc((100% - ${SCALE_LABEL_WIDTH}) / ${lane.lanes} - 6px)`,
      },
    };
  });
});

const placedGaps = computed<PlacedGap[]>(() =>
  timelineGaps(items.value, GAP_MIN_SEC).map((gap) => placeGap(gap)),
);

const nowTop = computed(() => offsetOf(props.now));
const nowLabel = computed(() => formatTime(nowIso.value, props.timeZone));

function offsetOf(epochMs: number): number {
  const hoursFromScaleStart =
    (epochMs - Date.parse(props.day.from)) / HOUR_MS - hours.value.startHour;
  return hoursFromScaleStart * HOUR_HEIGHT_PX;
}

function placeGap(gap: TimelineGap): PlacedGap {
  const range = {
    startedAt: new Date(gap.startMs).toISOString(),
    endedAt: new Date(gap.endMs).toISOString(),
  };
  const times = `${formatTime(range.startedAt, props.timeZone)}–${formatTime(range.endedAt, props.timeZone)}`;
  const top = offsetOf(gap.startMs);
  return {
    key: range.startedAt,
    range,
    label: t("timeline.gap", {
      duration: formatDuration((gap.endMs - gap.startMs) / MS_PER_SECOND, currentLocale()),
    }),
    fillLabel: t("timeline.fillGap", { range: times }),
    style: {
      top: `${top + 1}px`,
      height: `${Math.max(0, offsetOf(gap.endMs) - top - BLOCK_INSET_PX)}px`,
    },
  };
}
</script>

<template>
  <AppIsland
    as="section"
    padding="none"
    :aria-labelledby="titleId"
    class="px-3.5 pt-4 pb-6 md:px-6"
  >
    <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 :id="titleId" class="text-title">{{ t("timeline.title") }}</h2>
      <span class="text-meta text-fg-subtle">{{ dateLabel }}</span>
      <AppButton
        variant="quiet-accent"
        size="xs"
        class="ml-auto"
        :disabled="!isOnline"
        @click="emit('add')"
      >
        <Plus :size="15" aria-hidden="true" />
        {{ t("timeline.add") }}
      </AppButton>
    </div>
    <div class="relative isolate" :style="{ height: `${scaleHeight}px` }">
      <div
        v-for="mark in hourMarks"
        :key="mark.label"
        class="absolute inset-x-0 border-t border-line"
        :style="{ top: `${mark.top}px` }"
      >
        <span
          class="absolute left-0 -translate-y-1/2 bg-surface-island pr-1.5 font-code text-caps tracking-normal text-fg-faint"
        >
          {{ mark.label }}
        </span>
      </div>
      <div
        v-for="gap in placedGaps"
        :key="gap.key"
        class="absolute right-0 left-14 flex items-center justify-center gap-2 rounded-field border border-dashed border-line-strong"
        :style="gap.style"
      >
        <span class="text-meta text-fg-subtle">{{ gap.label }}</span>
        <AppButton
          variant="quiet-accent"
          size="2xs"
          :aria-label="gap.fillLabel"
          :disabled="!isOnline"
          @click="emit('fill', gap.range)"
        >
          <Plus :size="13" aria-hidden="true" />
          {{ t("timeline.fill") }}
        </AppButton>
      </div>
      <TimelineSession
        v-for="placed in placedSessions"
        :key="placed.session.id"
        class="absolute"
        :style="placed.style"
        :session="placed.session"
        :project="projects.get(placed.session.task.projectId ?? '') ?? null"
        :height-px="placed.heightPx"
        :now
        :time-zone
        @edit="emit('edit', placed.session)"
      />
      <div class="absolute right-0 left-12 z-20 h-0.5 bg-primary" :style="{ top: `${nowTop}px` }">
        <span
          class="absolute right-full -translate-y-1/2 bg-surface-island pr-1 font-code text-caps tracking-normal text-primary"
        >
          {{ nowLabel }}
        </span>
      </div>
    </div>
  </AppIsland>
</template>
