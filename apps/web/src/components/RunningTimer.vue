<script setup lang="ts">
import { Square } from "@lucide/vue";
import { formatTime, type Project, type SessionWithTask } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { isOnline } from "../connection.ts";
import MetaSeparator from "./MetaSeparator.vue";
import RunningNote from "./RunningNote.vue";
import TimerClock from "./TimerClock.vue";
import AppIconButton from "./ui/AppIconButton.vue";
import AppPulseDot from "./ui/AppPulseDot.vue";
import NotionMark from "./ui/NotionMark.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const props = defineProps<{
  session: SessionWithTask;
  project: Project | null;
  fromNotion: boolean;
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{ stop: [] }>();

const { t } = useI18n();

const since = computed(() =>
  t("timers.since", { time: formatTime(props.session.startedAt, props.timeZone) }),
);
</script>

<template>
  <li
    class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 border-b border-line pt-2 pr-3.5 pb-3 pl-5 md:gap-x-4"
  >
    <AppPulseDot :size="10" />
    <div class="min-w-0">
      <div class="flex items-center gap-1.5">
        <RouterLink
          :to="`/tasks/${session.task.id}`"
          class="min-w-0 text-task leading-snug font-semibold break-words text-fg no-underline hover:text-primary"
        >
          {{ session.task.title }}
        </RouterLink>
        <NotionMark v-if="fromNotion" />
      </div>
      <div class="flex flex-wrap items-center gap-x-1.5 text-meta text-fg-subtle">
        <span class="inline-flex min-w-0 items-center gap-1.5">
          <ProjectMarker v-if="project" :color="project.color" :size="8" />
          <span class="break-words">{{ project?.name ?? t("home.noProject") }}</span>
        </span>
        <MetaSeparator />
        <span>{{ since }}</span>
        <MetaSeparator />
        <RunningNote :session-id="session.id" :note="session.note" :title="session.task.title" />
      </div>
    </div>
    <TimerClock
      :started-at="session.startedAt"
      :now
      class="text-[clamp(22px,4.4vw,32px)] leading-none tracking-[-0.02em] tabular-nums"
    />
    <AppIconButton
      :label="t('timers.stopTask', { title: session.task.title })"
      size="lg"
      tone="stop"
      :disabled="!isOnline"
      @click="emit('stop')"
    >
      <Square :size="15" aria-hidden="true" class="fill-current" />
    </AppIconButton>
  </li>
</template>
