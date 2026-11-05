<script setup lang="ts">
import {
  elapsedSec,
  formatClock,
  formatDuration,
  type Project,
  type SessionWithTask,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import { sessionRange } from "../session-range.ts";
import AppPulseDot from "./ui/AppPulseDot.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const RANGE_MIN_HEIGHT_PX = 44;
const NOTE_MIN_HEIGHT_PX = 62;

const props = defineProps<{
  session: SessionWithTask;
  project: Project | null;
  heightPx: number;
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{ edit: [] }>();

const { t } = useI18n();

const isRunning = computed(() => props.session.endedAt === null);

const range = computed(() => sessionRange(props.session, props.timeZone, currentLocale()));

const label = computed(() =>
  t("timeline.editSession", { title: props.session.task.title, range: range.value }),
);

const duration = computed(() =>
  isRunning.value
    ? formatClock(elapsedSec(props.session.startedAt, props.now))
    : formatDuration(props.session.durationSec, currentLocale()),
);
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    class="flex cursor-pointer flex-col overflow-hidden rounded-field border-2 px-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="[
      isRunning
        ? 'z-10 border-primary bg-surface-island'
        : 'border-transparent bg-surface-page hover:bg-surface-active',
      heightPx < RANGE_MIN_HEIGHT_PX ? 'justify-center' : 'justify-start py-1',
    ]"
    @click="emit('edit')"
  >
    <span class="flex min-w-0 items-center gap-1.5">
      <AppPulseDot v-if="isRunning" :size="8" />
      <ProjectMarker v-else-if="project" :color="project.color" :size="8" />
      <span class="min-w-0 flex-1 truncate text-meta font-semibold text-fg">
        {{ session.task.title }}
      </span>
      <span
        class="flex-none font-code text-meta tabular-nums"
        :class="isRunning ? 'text-primary' : 'text-fg-muted'"
      >
        {{ duration }}
      </span>
    </span>
    <span
      v-if="heightPx >= RANGE_MIN_HEIGHT_PX"
      class="font-code text-caps tracking-normal text-fg-subtle"
    >
      {{ range }}
    </span>
    <span
      v-if="heightPx >= NOTE_MIN_HEIGHT_PX && session.note !== ''"
      class="truncate text-meta text-fg-muted"
    >
      {{ session.note }}
    </span>
  </button>
</template>
