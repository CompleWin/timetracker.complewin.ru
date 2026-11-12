<script setup lang="ts">
import { Search, Square } from "@lucide/vue";
import { formatClock } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../../i18n.ts";
import {
  demoNote,
  demoPicker,
  demoPins,
  demoTimers,
  triggerHighlighted,
  type DemoMoment,
  type DemoSession,
} from "../../landing-demo.ts";
import AppKbd from "../ui/AppKbd.vue";
import DemoPicker from "./DemoPicker.vue";
import DemoTimer from "./DemoTimer.vue";

const props = defineProps<{ moment: DemoMoment; sessions: DemoSession[] }>();

const { t } = useI18n();

const timers = computed(() => demoTimers(props.moment));
const runningCount = computed(() => timers.value.filter((timer) => timer.shown).length);
const heading = computed(() =>
  runningCount.value > 1
    ? t("timers.runningCount", { count: runningCount.value })
    : t("timers.running"),
);
const note = computed(() => demoNote(props.moment, currentLocale()));
const picker = computed(() => demoPicker(props.moment, props.sessions, currentLocale()));
const pins = computed(() => demoPins(props.moment));
const runningClock = computed(() => formatClock(timers.value[0]?.seconds ?? 0));
</script>

<template>
  <div
    class="relative z-[5] rounded-island bg-surface-island transition-colors duration-300"
    :class="runningCount > 0 ? 'border-2 border-primary' : 'border border-line'"
  >
    <div
      class="overflow-hidden [transition:height_450ms_cubic-bezier(0.4,0,0.2,1),visibility_450ms]"
      :class="runningCount > 0 ? 'h-[42px]' : 'invisible h-0'"
    >
      <div class="flex min-h-[42px] items-center gap-2.5 pt-2 pr-3.5 pl-5">
        <span class="text-caps whitespace-nowrap text-fg-faint uppercase">{{ heading }}</span>
        <span
          class="ml-auto inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-meta whitespace-nowrap text-fg-muted [transition:opacity_300ms,visibility_300ms]"
          :class="runningCount > 1 ? 'opacity-100' : 'invisible opacity-0'"
        >
          <Square :size="10" class="fill-current" />
          {{ t("timers.stopAll") }}
        </span>
      </div>
    </div>
    <DemoTimer
      v-for="timer in timers"
      :key="timer.id"
      :timer
      :note="timer.id === 'a' ? note : null"
    />
    <div class="flex flex-wrap items-center gap-2.5 p-3">
      <div class="relative min-w-0 flex-[1_1_260px]">
        <div
          data-demo-target="trigger"
          class="flex h-[52px] w-full items-center gap-3 rounded-full border pr-3 pl-4 transition-colors duration-150"
          :class="triggerHighlighted(moment) ? 'border-primary' : 'border-line-strong'"
        >
          <Search :size="17" class="flex-none text-fg-faint" />
          <span class="min-w-0 flex-1 truncate text-input text-fg-faint">
            {{ t("launch.trigger") }}
          </span>
          <AppKbd>N</AppKbd>
        </div>
        <DemoPicker
          :picker
          :pins
          :running-clock
          class="absolute top-[60px] left-0 z-[31] w-[560px]"
        />
      </div>
      <span
        class="inline-flex min-h-[46px] items-center px-4 text-body font-semibold whitespace-nowrap text-primary"
      >
        {{ t("launch.addManually") }}
      </span>
    </div>
  </div>
</template>
