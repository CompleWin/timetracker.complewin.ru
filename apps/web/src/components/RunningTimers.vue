<script setup lang="ts">
import type { ActiveSession } from "@stt/shared";
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import RunningTimer from "./RunningTimer.vue";
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
      <RunningTimer
        v-for="session in sessions"
        :key="session.id"
        :session
        :now
        @stop="emit('stop', session.taskId)"
      />
    </ul>
  </AppIsland>
</template>
