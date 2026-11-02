<script setup lang="ts">
import { Archive, Pencil } from "@lucide/vue";
import { formatDuration, type ActiveSession, type Task } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { currentLocale } from "../i18n.ts";
import { liveTotalSec } from "../timers.ts";
import TimerButton from "./TimerButton.vue";
import TimerClock from "./TimerClock.vue";
import AppMenu, { type MenuItem } from "./ui/AppMenu.vue";

const props = defineProps<{ task: Task; running: ActiveSession | undefined; now: number }>();
const emit = defineEmits<{ edit: []; archive: []; start: []; stop: [] }>();

const { t } = useI18n();

const menu = computed<MenuItem[]>(() => [
  { label: t("tasks.editAction"), icon: Pencil, select: () => emit("edit") },
  { label: t("actions.archive"), icon: Archive, select: () => emit("archive") },
]);

const total = computed(() => {
  const running = props.running === undefined ? [] : [props.running];
  return formatDuration(liveTotalSec(props.task.totalSec, running, props.now), currentLocale());
});
</script>

<template>
  <li
    class="flex flex-col gap-2 border-b border-line py-3.5 last:border-0 md:flex-row md:items-center md:gap-3"
  >
    <span class="min-w-0 flex-1 text-body break-words">
      <RouterLink :to="`/tasks/${task.id}`" class="text-fg no-underline hover:text-primary">
        {{ task.title }}
      </RouterLink>
    </span>
    <div class="flex items-center gap-3">
      <span class="font-code text-meta text-fg-subtle max-md:flex-1">{{ total }}</span>
      <TimerClock v-if="running" :started-at="running.startedAt" :now />
      <TimerButton
        :title="task.title"
        :running="running !== undefined"
        @start="emit('start')"
        @stop="emit('stop')"
      />
      <AppMenu :label="t('tasks.actions', { title: task.title })" :items="menu" />
    </div>
  </li>
</template>
