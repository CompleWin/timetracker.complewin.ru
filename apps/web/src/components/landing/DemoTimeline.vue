<script setup lang="ts">
import { Plus } from "@lucide/vue";
import { formatClock, formatDuration, formatTime, formatWeekdayDate } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../../i18n.ts";
import {
  DEMO_TIME_ZONE,
  demoIso,
  PROJECT_COLORS,
  sessionSec,
  taskName,
  taskProject,
  type DemoMoment,
  type DemoSession,
} from "../../landing-demo.ts";
import AppPulseDot from "../ui/AppPulseDot.vue";
import ProjectMarker from "../ui/ProjectMarker.vue";

type PlacedBlock = {
  session: DemoSession;
  style: Record<string, string>;
  tall: boolean;
  duration: string;
  range: string;
};

const MINUTES_PER_HOUR = 60;
const SCALE_ORIGIN_MIN = 10 * MINUTES_PER_HOUR;
const FIRST_HOUR = 10;
const HOURS_BEHIND = 3;
const HOURS_AHEAD = 3;
const VISIBLE_PAST_MIN = 2 * MINUTES_PER_HOUR;
const VIEW_TOP_PX = 14;
const LABEL_WIDTH_PX = 56;
const LANES_WIDTH_PX = 534;
const LANE_GAP_PX = 6;
const BLOCK_MIN_HEIGHT_PX = 22;
const BLOCK_INSET_PX = 3;
const TALL_BLOCK_PX = 44;
const GAP_START_MIN = 13 * MINUTES_PER_HOUR + 45;
const GAP_END_MIN = 14 * MINUTES_PER_HOUR + 20;

const props = defineProps<{ moment: DemoMoment; sessions: DemoSession[] }>();

const { t } = useI18n();

const nowHour = computed(() => Math.floor(props.moment.nowMin / MINUTES_PER_HOUR));
const firstShownHour = computed(() => Math.max(FIRST_HOUR, nowHour.value - HOURS_BEHIND));
const dateLabel = computed(() => formatWeekdayDate(demoIso(0), DEMO_TIME_ZONE, currentLocale()));

const hourMarks = computed(() =>
  Array.from({ length: nowHour.value + HOURS_AHEAD - firstShownHour.value + 1 }, (_, index) => {
    const hour = firstShownHour.value + index;
    return {
      hour,
      label: `${String(hour % 24).padStart(2, "0")}:00`,
      top: offsetOf(hour * MINUTES_PER_HOUR),
    };
  }),
);

const blocks = computed<PlacedBlock[]>(() =>
  props.sessions
    .filter((session) => session.endMin >= firstShownHour.value * MINUTES_PER_HOUR)
    .map(placeBlock),
);

const gap = computed(() => ({
  label: t("timeline.gap", {
    duration: formatDuration((GAP_END_MIN - GAP_START_MIN) * 60, currentLocale()),
  }),
  style: {
    top: `${offsetOf(GAP_START_MIN) + 1}px`,
    height: `${GAP_END_MIN - GAP_START_MIN - BLOCK_INSET_PX}px`,
  },
}));

const nowTop = computed(() => offsetOf(props.moment.nowMin));
const nowLabel = computed(() => formatTime(demoIso(props.moment.nowMin), DEMO_TIME_ZONE));
const shift = computed(
  () => VIEW_TOP_PX - offsetOf(nowHour.value * MINUTES_PER_HOUR - VISIBLE_PAST_MIN),
);

function offsetOf(minutes: number): number {
  return minutes - SCALE_ORIGIN_MIN;
}

function placeBlock(session: DemoSession): PlacedBlock {
  const top = offsetOf(session.startMin);
  const height = Math.max(BLOCK_MIN_HEIGHT_PX, offsetOf(session.endMin) - top - BLOCK_INSET_PX);
  const laneWidth = LANES_WIDTH_PX / session.lanes;
  const locale = currentLocale();
  const start = formatTime(demoIso(session.startMin), DEMO_TIME_ZONE);
  const end = session.running ? "" : formatTime(demoIso(session.endMin), DEMO_TIME_ZONE);
  return {
    session,
    tall: height >= TALL_BLOCK_PX,
    duration: session.running
      ? formatClock(sessionSec(session))
      : formatDuration(sessionSec(session), locale),
    range: `${start}–${end}`,
    style: {
      top: `${top + 1}px`,
      height: `${height}px`,
      left: `${LABEL_WIDTH_PX + laneWidth * session.lane}px`,
      width: `${laneWidth - LANE_GAP_PX}px`,
    },
  };
}
</script>

<template>
  <div class="rounded-island border border-line bg-surface-island px-6 py-4">
    <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-title">{{ t("timeline.title") }}</span>
      <span class="text-meta text-fg-subtle">{{ dateLabel }}</span>
    </div>
    <div class="relative h-[224px] overflow-hidden mask-timeline-window">
      <div
        class="absolute inset-x-0 top-0 isolate transition-transform duration-900 ease-[cubic-bezier(0.4,0,0.2,1)]"
        :style="{ transform: `translateY(${shift}px)` }"
      >
        <div
          v-for="mark in hourMarks"
          :key="mark.hour"
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
          class="absolute right-0 left-14 flex items-center justify-center gap-2 rounded-field border border-dashed border-line-strong bg-surface-island"
          :style="gap.style"
        >
          <span class="text-meta whitespace-nowrap text-fg-subtle">{{ gap.label }}</span>
          <span
            class="inline-flex items-center gap-1.5 text-meta font-semibold whitespace-nowrap text-primary"
          >
            <Plus :size="13" />
            {{ t("timeline.fill") }}
          </span>
        </div>
        <div
          v-for="block in blocks"
          :key="block.session.id"
          class="absolute flex flex-col overflow-hidden rounded-field border-2 px-2 [transition:height_300ms_linear,width_450ms_cubic-bezier(0.4,0,0.2,1),left_450ms_cubic-bezier(0.4,0,0.2,1),background-color_400ms,border-color_400ms]"
          :class="[
            block.session.running
              ? 'z-[25] border-primary bg-surface-island'
              : 'z-[1] border-transparent bg-surface-page',
            block.tall ? 'justify-start py-1' : 'justify-center',
          ]"
          :style="block.style"
        >
          <span class="flex min-w-0 items-center gap-1.5">
            <AppPulseDot v-if="block.session.running" :size="8" />
            <ProjectMarker
              v-else
              :color="PROJECT_COLORS[taskProject(block.session.task)]"
              :size="8"
            />
            <span class="min-w-0 flex-1 truncate text-meta font-semibold text-fg">
              {{ taskName(block.session.task, currentLocale()) }}
            </span>
            <span
              v-if="block.session.lanes === 1"
              class="flex-none font-code text-meta whitespace-nowrap tabular-nums"
              :class="block.session.running ? 'text-primary' : 'text-fg-muted'"
            >
              {{ block.duration }}
            </span>
          </span>
          <span
            v-if="block.tall"
            class="font-code text-caps tracking-normal whitespace-nowrap text-fg-subtle"
          >
            {{ block.range }}
          </span>
        </div>
        <div
          class="absolute right-0 left-12 z-20 -mt-px h-0.5 bg-primary [transition:top_300ms_linear]"
          :style="{ top: `${nowTop}px` }"
        >
          <span
            class="absolute top-1/2 right-full w-12 -translate-y-1/2 bg-surface-island pr-1 font-code text-caps tracking-normal text-primary"
          >
            {{ nowLabel }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
