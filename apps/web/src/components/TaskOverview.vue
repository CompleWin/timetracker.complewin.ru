<script setup lang="ts">
import { Archive, Pencil, Play, Square } from "@lucide/vue";
import {
  formatDateTime,
  formatDuration,
  formatTime,
  tc,
  type Project,
  type Session,
  type Task,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { isOnline } from "../connection.ts";
import { relativeDay, totalSec } from "../day-sessions.ts";
import { currentLocale } from "../i18n.ts";
import { liveTotalSec } from "../timers.ts";
import TimerClock from "./TimerClock.vue";
import AppIconButton from "./ui/AppIconButton.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppPulseDot from "./ui/AppPulseDot.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";
import NotionMark from "./ui/NotionMark.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const props = defineProps<{
  task: Task;
  project: Project | null;
  active: boolean;
  running: Session | undefined;
  todaySessions: Session[];
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{ edit: []; archive: []; start: []; stop: [] }>();

const { t } = useI18n();

const total = computed(() => {
  const running = props.running === undefined ? [] : [props.running];
  const seconds = liveTotalSec(props.task.totalSec, running, props.now);
  return t("tasks.total", { duration: formatDuration(seconds, currentLocale()) });
});

const today = computed(() => {
  const locale = currentLocale();
  return t("tasks.today", {
    duration: formatDuration(totalSec(props.todaySessions, props.now), locale),
    sessions: tc(locale, "summary.sessions", props.todaySessions.length),
  });
});

const runningSince = computed(() =>
  props.running === undefined
    ? ""
    : t("tasks.runningSince", { time: formatTime(props.running.startedAt, props.timeZone) }),
);

const lastStart = computed(() => {
  const { lastStartedAt } = props.task;
  if (lastStartedAt === null) return t("tasks.neverStarted");
  const time = formatTime(lastStartedAt, props.timeZone);
  const relative = relativeDay(lastStartedAt, props.now, props.timeZone);
  if (relative === "today") return t("tasks.lastToday", { time });
  if (relative === "yesterday") return t("tasks.lastYesterday", { time });
  const dateTime = formatDateTime(lastStartedAt, props.timeZone, currentLocale());
  return t("tasks.lastAt", { dateTime });
});
</script>

<template>
  <AppIsland padding="none" class="px-4 pt-5 pb-6 md:px-6">
    <div class="flex items-center gap-2">
      <ProjectMarker v-if="project" :color="project.color" />
      <AppSectionLabel class="min-w-0 flex-1 break-words">
        {{ project?.name ?? t("home.noProject") }}
      </AppSectionLabel>
      <div class="-mr-2 flex gap-0.5">
        <AppIconButton size="toolbar" :label="t('tasks.edit')" @click="emit('edit')">
          <Pencil :size="17" aria-hidden="true" />
        </AppIconButton>
        <AppIconButton
          v-if="active"
          size="toolbar"
          :label="t('actions.archive')"
          @click="emit('archive')"
        >
          <Archive :size="17" aria-hidden="true" />
        </AppIconButton>
      </div>
    </div>
    <div class="mt-1 flex items-center gap-1.5">
      <h1 class="min-w-0 text-h2 break-words">{{ task.title }}</h1>
      <NotionMark v-if="task.notionPageUrl !== null" size="heading" />
    </div>
    <div class="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <span
        class="inline-flex h-[30px] items-center rounded-full bg-primary-soft px-3.5 text-small text-primary-ink"
      >
        {{ total }}
      </span>
      <span class="text-small text-fg-subtle">{{ today }}</span>
    </div>
    <div v-if="active" class="mt-5 flex items-center gap-3.5 border-t border-line pt-4">
      <template v-if="running">
        <AppPulseDot :size="10" />
        <span class="text-small text-fg-subtle">{{ runningSince }}</span>
        <TimerClock
          :started-at="running.startedAt"
          :now
          class="ml-auto text-[clamp(26px,4vw,36px)] leading-none tracking-[-0.02em] tabular-nums"
        />
        <AppIconButton
          :label="t('timers.stopTask', { title: task.title })"
          size="2xl"
          tone="stop"
          :disabled="!isOnline"
          @click="emit('stop')"
        >
          <Square :size="15" aria-hidden="true" class="fill-current" />
        </AppIconButton>
      </template>
      <template v-else>
        <span class="text-small text-fg-subtle">{{ lastStart }}</span>
        <AppIconButton
          :label="t('timers.startTask', { title: task.title })"
          size="2xl"
          tone="start"
          class="ml-auto"
          :disabled="!isOnline"
          @click="emit('start')"
        >
          <Play :size="17" aria-hidden="true" class="translate-x-0.5 fill-current" />
        </AppIconButton>
      </template>
    </div>
  </AppIsland>
</template>
