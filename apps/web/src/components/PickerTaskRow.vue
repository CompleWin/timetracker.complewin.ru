<script setup lang="ts">
import { ArrowUpRight, Play, Star } from "@lucide/vue";
import {
  elapsedSec,
  formatClock,
  formatDuration,
  type Project,
  type SessionWithTask,
  type Task,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { currentLocale } from "../i18n.ts";
import AppIconButton from "./ui/AppIconButton.vue";
import AppPulseDot from "./ui/AppPulseDot.vue";
import NotionMark from "./ui/NotionMark.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const props = defineProps<{
  task: Task;
  project: Project | null;
  withProject: boolean;
  nested: boolean;
  running: SessionWithTask | undefined;
  todaySec: number;
  highlighted: boolean;
  entryKey: string;
  now: number;
}>();
const emit = defineEmits<{ choose: []; pin: []; hover: [] }>();

const { t } = useI18n();

const chooseLabel = computed(() =>
  props.running === undefined
    ? t("timers.startTask", { title: props.task.title })
    : t("picker.alreadyRunning", { title: props.task.title }),
);
const pinLabel = computed(() =>
  t(props.task.pinned ? "picker.unpin" : "picker.pin", { title: props.task.title }),
);
const clock = computed(() =>
  props.running === undefined ? "" : formatClock(elapsedSec(props.running.startedAt, props.now)),
);
const today = computed(() => formatDuration(props.todaySec, currentLocale()));
</script>

<template>
  <div
    :data-entry="entryKey"
    class="flex min-h-[42px] items-center gap-1 rounded-field pr-1 transition-colors duration-150"
    :class="[nested ? 'pl-10' : 'pl-3', highlighted ? 'bg-surface-page' : '']"
    @pointerenter="emit('hover')"
  >
    <button
      type="button"
      :aria-label="chooseLabel"
      class="flex min-h-[42px] min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="emit('choose')"
    >
      <AppPulseDot v-if="running" :size="8" />
      <span class="flex min-w-[45%] flex-1 items-center gap-1.5">
        <span class="min-w-0 truncate text-body text-fg">{{ task.title }}</span>
        <NotionMark v-if="task.notionPageUrl !== null" />
      </span>
      <span
        v-if="withProject"
        class="flex min-w-0 shrink items-center gap-1.5 text-meta text-fg-subtle"
      >
        <ProjectMarker v-if="project" :color="project.color" :size="8" />
        <span class="truncate">{{ project?.name ?? t("home.noProject") }}</span>
      </span>
      <span v-if="running" class="flex-none font-code text-meta text-primary tabular-nums">
        {{ clock }}
      </span>
      <span v-else-if="todaySec > 0" class="flex-none font-code text-meta text-fg-subtle">
        {{ today }}
      </span>
    </button>
    <AppIconButton :label="pinLabel" size="sm" @click="emit('pin')">
      <Star
        :size="17"
        aria-hidden="true"
        :class="task.pinned ? 'fill-current text-project-yellow' : 'text-fg-faint'"
      />
    </AppIconButton>
    <RouterLink
      :to="`/tasks/${task.id}`"
      :aria-label="t('picker.openTask', { title: task.title })"
      :title="t('picker.openTask', { title: task.title })"
      class="inline-flex size-8 flex-none items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-surface-island hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:size-11"
    >
      <ArrowUpRight :size="17" aria-hidden="true" />
    </RouterLink>
    <span
      v-if="highlighted && !running"
      aria-hidden="true"
      class="flex size-8 flex-none cursor-pointer items-center justify-center rounded-full bg-primary text-white"
      @click="emit('choose')"
    >
      <Play :size="11" class="translate-x-px fill-current" />
    </span>
  </div>
</template>
