<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { APP_ICON } from "../../app-icon.ts";
import { useDemoClock } from "../../demo-clock.ts";
import {
  activeClicks,
  cursorPressed,
  DEMO_CURSOR_IN_MS,
  DEMO_FADE_IN_MS,
  demoMoment,
  demoSessions,
  waypointAt,
  type DemoTarget,
} from "../../landing-demo.ts";
import DemoCursor from "./DemoCursor.vue";
import DemoLaunch from "./DemoLaunch.vue";
import DemoSummary from "./DemoSummary.vue";
import DemoTimeline from "./DemoTimeline.vue";

type Point = { x: number; y: number };

const WIDE_STAGE_PX = 960;
const COMPACT_STAGE_PX = 672;
const STAGE_HEIGHT_PX = 900;
const HOME_OFFSET_PX = 380;
const HOME_EDGE_PX = 44;
const HOME_Y_PX = 236;
const REST_Y_PX = 480;
const TRIGGER_POINT_X = 0.42;
const TARGET_POINT_X = 0.5;
const TARGET_POINT_Y = 0.55;

const { t } = useI18n();
const wrapper = useTemplateRef("wrapper");
const stage = useTemplateRef("stage");
const containerWidth = ref(WIDE_STAGE_PX);
const cursor = ref<Point>(homePoint(WIDE_STAGE_PX));
let reachedTarget: DemoTarget | null = null;
let resizeObserver: ResizeObserver | undefined;

const { elapsed, animated } = useDemoClock(wrapper, followWaypoint);

const stageWidth = computed(() =>
  containerWidth.value >= WIDE_STAGE_PX ? WIDE_STAGE_PX : COMPACT_STAGE_PX,
);
const scale = computed(() => Math.min(1, containerWidth.value / stageWidth.value));
const moment = computed(() => demoMoment(elapsed.value));
const sessions = computed(() => demoSessions(moment.value));
const contentShown = computed(() => !animated || elapsed.value >= DEMO_FADE_IN_MS);
const cursorShown = computed(() => elapsed.value >= DEMO_CURSOR_IN_MS);
const ripples = computed(() =>
  activeClicks(moment.value.t).map((click) => `${moment.value.cycle}-${click}`),
);
const avatarLetter = computed(() => t("demo.user").charAt(0));

watch(stageWidth, (width) => {
  reachedTarget = null;
  cursor.value = homePoint(width);
});
watch(scale, () => (reachedTarget = null));

onMounted(() => {
  measure();
  if (wrapper.value === null) return;
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(wrapper.value);
});
onUnmounted(() => resizeObserver?.disconnect());

function measure(): void {
  if (wrapper.value !== null) containerWidth.value = wrapper.value.clientWidth;
}

function homePoint(width: number): Point {
  return { x: Math.min(width / 2 + HOME_OFFSET_PX, width - HOME_EDGE_PX), y: HOME_Y_PX };
}

function followWaypoint(): void {
  const target = waypointAt(moment.value.t);
  if (target === reachedTarget) return;
  const point = pointOf(target);
  if (point === null) return;
  reachedTarget = target;
  cursor.value = point;
}

function pointOf(target: DemoTarget): Point | null {
  const home = homePoint(stageWidth.value);
  if (target === "home") return home;
  if (target === "rest") return { x: home.x, y: REST_Y_PX };
  const element = stage.value?.querySelector(`[data-demo-target="${target}"]`);
  if (stage.value === null || !(element instanceof HTMLElement)) return null;
  const box = element.getBoundingClientRect();
  const origin = stage.value.getBoundingClientRect();
  const pointX = target === "trigger" ? TRIGGER_POINT_X : TARGET_POINT_X;
  return {
    x: (box.left + box.width * pointX - origin.left) / scale.value,
    y: (box.top + box.height * TARGET_POINT_Y - origin.top) / scale.value,
  };
}
</script>

<template>
  <div class="relative mx-auto mt-[clamp(44px,5vw,64px)] max-w-[1200px] px-4">
    <div
      ref="wrapper"
      aria-hidden="true"
      class="relative"
      :style="{ height: `${Math.round(STAGE_HEIGHT_PX * scale)}px` }"
    >
      <div
        ref="stage"
        class="absolute top-0 left-1/2 h-[900px] origin-top"
        :style="{ width: `${stageWidth}px`, transform: `translateX(-50%) scale(${scale})` }"
      >
        <div
          class="pointer-events-none absolute -inset-x-[14%] -inset-y-[10%] rounded-full bg-demo-glow"
        />
        <div
          class="absolute inset-0 overflow-hidden rounded-[28px] border border-line bg-surface-page mask-fade-bottom"
        >
          <div class="flex h-[68px] items-center gap-4 px-7">
            <div
              class="flex items-center gap-2.5 font-code text-[18px] leading-none font-bold tracking-[-0.04em] text-fg"
            >
              <img :src="APP_ICON" alt="" class="size-6 flex-none rounded-[6px]" />
              <span class="flex items-center gap-1.5">
                simple<span class="h-1 w-2 rounded-full bg-fg" />time<span
                  class="h-1 w-2 rounded-full bg-primary"
                />tracker
              </span>
            </div>
            <div class="ml-auto flex h-11 items-center gap-2 px-1.5">
              <span
                class="flex size-8 items-center justify-center rounded-full bg-primary-soft text-meta font-semibold text-primary-ink"
              >
                {{ avatarLetter }}
              </span>
              <ChevronDown :size="16" class="text-fg-subtle" />
            </div>
          </div>
          <div
            class="mx-auto mt-2 flex w-[640px] flex-col gap-4 transition-opacity duration-600"
            :class="contentShown ? 'opacity-100' : 'opacity-0'"
          >
            <DemoLaunch :moment :sessions />
            <DemoTimeline :moment :sessions />
            <DemoSummary :sessions />
          </div>
        </div>
        <template v-if="animated">
          <span
            v-for="ripple in ripples"
            :key="ripple"
            class="pointer-events-none absolute z-[59] size-9 rounded-full border-2 border-primary motion-safe:animate-ripple"
            :style="{ left: `${cursor.x - 18}px`, top: `${cursor.y - 18}px` }"
          />
          <DemoCursor
            :point="cursor"
            :shown="cursorShown"
            :pressed="cursorPressed(moment.t)"
            :name="t('demo.user')"
          />
        </template>
      </div>
    </div>
  </div>
</template>
