<script setup lang="ts">
import { Plus, X } from "@lucide/vue";
import {
  formatDuration,
  formatTime,
  formatWeekdayDate,
  timelineGaps,
  timelineLanes,
  type DayRange,
  type HiddenGap,
  type Project,
  type SessionWithTask,
  type TimelineGap,
} from "@stt/shared";
import { computed, onMounted, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isOnline } from "../connection.ts";
import { timelineItems } from "../day-sessions.ts";
import { currentLocale } from "../i18n.ts";
import { HOUR_MS, pastScaleHours, timelineHours } from "../timeline-scale.ts";
import type { SessionRange } from "./SessionDialog.vue";
import TimelineSession from "./TimelineSession.vue";
import AppButton from "./ui/AppButton.vue";
import AppIconButton from "./ui/AppIconButton.vue";
import AppIsland from "./ui/AppIsland.vue";

type PlacedSession = {
  session: SessionWithTask;
  style: Record<string, string>;
  heightPx: number;
  startMs: number;
  bottomPx: number;
};

type PlacedGap = {
  key: string;
  range: SessionRange;
  label: string;
  fillLabel: string;
  hideLabel: string;
  style: Record<string, string>;
};

const HOUR_HEIGHT_PX = 64;
const GAP_MIN_SEC = 20 * 60;
const MS_PER_SECOND = 1000;
const BLOCK_MIN_HEIGHT_PX = 24;
const BLOCK_INSET_PX = 3;
const SCALE_LABEL_WIDTH = "56px";
const NOW_WINDOW_SHARE = 2 / 3;

const props = defineProps<{
  sessions: SessionWithTask[];
  day: DayRange;
  isToday: boolean;
  projects: Map<string, Project>;
  showGaps: boolean;
  hiddenGaps: HiddenGap[];
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{
  add: [];
  edit: [session: SessionWithTask];
  fill: [range: SessionRange];
  hide: [gap: HiddenGap];
}>();

const { t } = useI18n();
const titleId = useId();
const scroller = useTemplateRef("scroller");
const scale = useTemplateRef("scale");

const nowIso = computed(() => new Date(props.now).toISOString());
const dateLabel = computed(() =>
  formatWeekdayDate(props.day.from, props.timeZone, currentLocale()),
);
const items = computed(() => timelineItems(props.sessions, props.now));
const dayHours = computed(() => timelineHours(props.day, props.timeZone, props.isToday));
const scaleHours = computed(() =>
  props.isToday ? dayHours.value : pastScaleHours(dayHours.value, items.value),
);
const scaleStart = computed(() => scaleHours.value[0]?.at ?? dayHours.value[0].at);
const scaleHeight = computed(() => offsetOf(scaleHours.value.at(-1)?.at ?? scaleStart.value));

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
      startMs: item?.startMs ?? 0,
      bottomPx: Math.max(bottom, top + BLOCK_MIN_HEIGHT_PX + BLOCK_INSET_PX),
      style: {
        top: `${top + 1}px`,
        height: `${heightPx}px`,
        left: `calc(${SCALE_LABEL_WIDTH} + (100% - ${SCALE_LABEL_WIDTH}) * ${lane.lane} / ${lane.lanes})`,
        width: `calc((100% - ${SCALE_LABEL_WIDTH}) / ${lane.lanes} - 6px)`,
      },
    };
  });
});

const placedGaps = computed<PlacedGap[]>(() => {
  if (!props.showGaps) return [];
  const hidden = new Set(
    props.hiddenGaps.map((gap) => gapKey(Date.parse(gap.startedAt), Date.parse(gap.endedAt))),
  );
  return timelineGaps(items.value, GAP_MIN_SEC)
    .filter((gap) => !hidden.has(gapKey(gap.startMs, gap.endMs)))
    .flatMap((gap) => placeGap(gap) ?? []);
});

const nowTop = computed(() => offsetOf(props.now));
const nowLabel = computed(() => formatTime(nowIso.value, props.timeZone));

onMounted(scrollToDay);
watch(() => props.day.from, scrollToDay, { flush: "post" });

function scrollToDay(): void {
  if (scroller.value === null || scale.value === null) return;
  scroller.value.scrollTop = props.isToday
    ? scale.value.offsetTop + nowTop.value - scroller.value.clientHeight * NOW_WINDOW_SHARE
    : 0;
}

function offsetOf(epochMs: number): number {
  return ((epochMs - scaleStart.value) / HOUR_MS) * HOUR_HEIGHT_PX;
}

function gapKey(startMs: number, endMs: number): string {
  return `${startMs}:${endMs}`;
}

function blocksBottomBefore(atMs: number): number {
  return Math.max(
    -Infinity,
    ...placedSessions.value
      .filter((placed) => placed.startMs < atMs)
      .map((placed) => placed.bottomPx),
  );
}

function placeGap(gap: TimelineGap): PlacedGap | undefined {
  const range = {
    startedAt: new Date(gap.startMs).toISOString(),
    endedAt: new Date(gap.endMs).toISOString(),
  };
  const times = `${formatTime(range.startedAt, props.timeZone)}–${formatTime(range.endedAt, props.timeZone)}`;
  const timeTop = offsetOf(gap.startMs);
  const top = Math.max(timeTop, blocksBottomBefore(gap.endMs));
  const heightPx = offsetOf(gap.endMs) - top - BLOCK_INSET_PX;
  if (top > timeTop && heightPx < BLOCK_MIN_HEIGHT_PX) return undefined;
  return {
    key: gapKey(gap.startMs, gap.endMs),
    range,
    label: t("timeline.gap", {
      duration: formatDuration((gap.endMs - gap.startMs) / MS_PER_SECOND, currentLocale()),
    }),
    fillLabel: t("timeline.fillGap", { range: times }),
    hideLabel: t("timeline.hideGap", { range: times }),
    style: {
      top: `${top + 1}px`,
      height: `${Math.max(0, heightPx)}px`,
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
    <div
      ref="scroller"
      role="region"
      :aria-label="t('timeline.scale')"
      tabindex="0"
      class="relative h-[640px] overflow-y-auto py-3 [scrollbar-width:thin]"
    >
      <div ref="scale" class="relative isolate" :style="{ height: `${scaleHeight}px` }">
        <div
          v-for="mark in scaleHours"
          :key="mark.at"
          class="absolute inset-x-0 border-t border-line"
          :style="{ top: `${offsetOf(mark.at)}px` }"
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
          class="absolute right-0 left-14 flex items-center gap-2 rounded-field border border-dashed border-line-strong px-2"
          :style="gap.style"
        >
          <div class="flex flex-1 items-center justify-center gap-2">
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
          <AppIconButton
            size="xs"
            :label="gap.hideLabel"
            class="z-10"
            :disabled="!isOnline"
            @click="emit('hide', gap.range)"
          >
            <X :size="15" aria-hidden="true" />
          </AppIconButton>
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
        <div
          v-if="isToday"
          class="absolute right-0 left-12 z-20 h-0.5 bg-primary"
          :style="{ top: `${nowTop}px` }"
        >
          <span
            class="absolute right-full -translate-y-1/2 bg-surface-island pr-1 font-code text-caps tracking-normal text-primary"
          >
            {{ nowLabel }}
          </span>
        </div>
      </div>
    </div>
  </AppIsland>
</template>
