<script setup lang="ts">
import type { ActiveSession } from "@stt/shared";
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import TimerButton from "./TimerButton.vue";
import TimerClock from "./TimerClock.vue";
import AppIsland from "./ui/AppIsland.vue";

defineProps<{ sessions: ActiveSession[]; now: number }>();
const emit = defineEmits<{ stop: [taskId: string] }>();

const { t } = useI18n();
const headingId = useId();
</script>

<template>
  <AppIsland as="section" accent :aria-labelledby="headingId">
    <h2 :id="headingId" class="text-title">{{ t("timers.running") }}</h2>
    <ul class="mt-2">
      <li
        v-for="session in sessions"
        :key="session.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3.5 last:border-0"
      >
        <span class="min-w-0 flex-1 basis-full text-body font-semibold break-words md:basis-0">
          {{ session.task.title }}
        </span>
        <TimerClock :started-at="session.startedAt" :now class="text-title max-md:flex-1" />
        <TimerButton :title="session.task.title" running @stop="emit('stop', session.taskId)" />
      </li>
    </ul>
  </AppIsland>
</template>
