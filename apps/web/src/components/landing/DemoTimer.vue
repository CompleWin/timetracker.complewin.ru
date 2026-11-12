<script setup lang="ts">
import { PenLine, Square } from "@lucide/vue";
import { formatClock, formatTime } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  DEMO_TIME_ZONE,
  demoIso,
  PROJECT_COLORS,
  PROJECT_NAMES,
  taskName,
  taskProject,
  type DemoNote,
  type DemoTimer,
} from "../../landing-demo.ts";
import { currentLocale } from "../../i18n.ts";
import MetaSeparator from "../MetaSeparator.vue";
import AppPulseDot from "../ui/AppPulseDot.vue";
import ProjectMarker from "../ui/ProjectMarker.vue";

const props = defineProps<{ timer: DemoTimer; note: DemoNote | null }>();

const { t } = useI18n();

const project = computed(() => taskProject(props.timer.task));
const since = computed(() =>
  t("timers.since", { time: formatTime(demoIso(props.timer.startMin), DEMO_TIME_ZONE) }),
);
const noteClass = computed(() => {
  if (props.note?.hovered === true) return "text-primary-hover";
  return props.note !== null && props.note.saved !== "" ? "text-fg-muted" : "text-fg-faint";
});
</script>

<template>
  <div
    class="overflow-hidden [transition:height_450ms_cubic-bezier(0.4,0,0.2,1),opacity_350ms,visibility_450ms]"
    :class="timer.shown ? 'h-[67px] opacity-100' : 'invisible h-0 opacity-0'"
  >
    <div
      class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-4 border-b border-line pt-2 pr-3.5 pb-3 pl-5"
    >
      <AppPulseDot :size="10" />
      <div class="min-w-0">
        <div class="truncate text-task leading-snug font-semibold text-fg">
          {{ taskName(timer.task, currentLocale()) }}
        </div>
        <div class="flex min-w-0 items-center gap-1.5 text-meta whitespace-nowrap text-fg-subtle">
          <span class="inline-flex flex-none items-center gap-1.5">
            <ProjectMarker :color="PROJECT_COLORS[project]" :size="8" />
            {{ t(PROJECT_NAMES[project]) }}
          </span>
          <MetaSeparator />
          <span class="flex-none">{{ since }}</span>
          <MetaSeparator />
          <span
            v-if="note?.editing"
            class="flex h-[22px] min-w-0 flex-[1_1_160px] items-center overflow-hidden border-b border-primary text-fg"
          >
            {{ note.draft }}
            <span
              class="ml-px inline-block h-[18px] w-0.5 flex-none bg-fg motion-safe:animate-caret"
            />
          </span>
          <span
            v-else
            :data-demo-target="note === null ? undefined : 'note-a'"
            class="inline-flex min-w-0 items-center gap-1 transition-colors duration-150"
            :class="noteClass"
          >
            <PenLine :size="15" class="flex-none" />
            <span class="truncate">{{ note?.saved || t("sessions.note") }}</span>
          </span>
        </div>
      </div>
      <span class="font-code text-[32px] leading-none tracking-[-0.02em] text-primary tabular-nums">
        {{ formatClock(timer.seconds) }}
      </span>
      <span
        :data-demo-target="`stop-${timer.id}`"
        class="flex size-[46px] flex-none items-center justify-center rounded-full border-2 border-fg transition-colors duration-150"
        :class="timer.stopPressed ? 'bg-fg text-surface-page' : 'text-fg'"
      >
        <Square :size="15" class="fill-current" />
      </span>
    </div>
  </div>
</template>
