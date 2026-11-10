<script setup lang="ts">
import { Square } from "@lucide/vue";
import type { Project, SessionWithTask } from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { isOnline } from "../connection.ts";
import RunningTimer from "./RunningTimer.vue";
import AppButton from "./ui/AppButton.vue";

const props = defineProps<{
  sessions: SessionWithTask[];
  projects: Map<string, Project>;
  notionTaskIds: Set<string>;
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{ stop: [session: SessionWithTask]; stopAll: [] }>();

const { t } = useI18n();
const headingId = useId();

const heading = computed(() =>
  props.sessions.length > 1
    ? t("timers.runningCount", { count: props.sessions.length })
    : t("timers.running"),
);
</script>

<template>
  <section :aria-labelledby="headingId">
    <div class="flex min-h-8 items-center justify-between gap-3 pt-2 pr-3.5 pl-5">
      <h2 :id="headingId" class="text-caps text-fg-faint uppercase">{{ heading }}</h2>
      <AppButton
        v-if="sessions.length > 1"
        variant="quiet"
        size="xs"
        :disabled="!isOnline"
        @click="emit('stopAll')"
      >
        <Square :size="10" aria-hidden="true" class="fill-current" />
        {{ t("timers.stopAll") }}
      </AppButton>
    </div>
    <ul>
      <RunningTimer
        v-for="session in sessions"
        :key="session.id"
        :session
        :project="projects.get(session.task.projectId ?? '') ?? null"
        :from-notion="notionTaskIds.has(session.task.id)"
        :now
        :time-zone
        @stop="emit('stop', session)"
      />
    </ul>
  </section>
</template>
