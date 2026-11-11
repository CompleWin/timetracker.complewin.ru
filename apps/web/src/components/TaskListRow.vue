<script setup lang="ts">
import { Archive, Pencil } from "@lucide/vue";
import { formatDuration, formatTime, type SessionWithTask, type Task } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { isOnline } from "../connection.ts";
import { currentLocale } from "../i18n.ts";
import { lastStartText } from "../last-start.ts";
import MetaSeparator from "./MetaSeparator.vue";
import AppCheckbox from "./ui/AppCheckbox.vue";
import AppIconButton from "./ui/AppIconButton.vue";
import AppPulseDot from "./ui/AppPulseDot.vue";
import NotionMark from "./ui/NotionMark.vue";

const props = defineProps<{
  task: Task;
  selected: boolean;
  running: SessionWithTask | undefined;
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{ toggle: []; edit: []; archive: [] }>();

const { t } = useI18n();

const total = computed(() =>
  t("tasks.total", { duration: formatDuration(props.task.totalSec, currentLocale()) }),
);
const timerLine = computed(() =>
  props.running === undefined
    ? lastStartText(props.task.lastStartedAt, props.now, props.timeZone, currentLocale())
    : t("tasks.runningSince", { time: formatTime(props.running.startedAt, props.timeZone) }),
);
</script>

<template>
  <div
    class="flex min-h-[62px] items-center gap-3 border-t border-line px-4 py-3 md:px-6"
    :class="{ 'bg-primary-soft': selected }"
  >
    <AppCheckbox
      :model-value="selected"
      :label="t('tasksPage.select', { title: task.title })"
      label-hidden
      @update:model-value="emit('toggle')"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <RouterLink
          :to="`/tasks/${task.id}`"
          class="min-w-0 text-body font-semibold break-words text-fg no-underline transition-colors duration-150 hover:text-primary"
        >
          {{ task.title }}
        </RouterLink>
        <NotionMark v-if="task.notionPageUrl !== null" />
      </div>
      <p class="flex flex-wrap items-center gap-x-1.5 text-meta text-fg-subtle">
        <span>{{ total }}</span>
        <MetaSeparator />
        <AppPulseDot v-if="running" :size="8" />
        <span>{{ timerLine }}</span>
      </p>
    </div>
    <div class="-mr-2 flex flex-none gap-0.5">
      <AppIconButton
        size="toolbar"
        :label="t('tasksPage.editTask', { title: task.title })"
        :disabled="!isOnline"
        @click="emit('edit')"
      >
        <Pencil :size="17" aria-hidden="true" />
      </AppIconButton>
      <AppIconButton
        size="toolbar"
        :label="t('tasksPage.archiveTask', { title: task.title })"
        :disabled="!isOnline"
        @click="emit('archive')"
      >
        <Archive :size="17" aria-hidden="true" />
      </AppIconButton>
    </div>
  </div>
</template>
