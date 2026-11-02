<script setup lang="ts">
import { Pencil } from "@lucide/vue";
import {
  formatDate,
  formatDuration,
  formatSessionRange,
  formatTime,
  type Session,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import TimerClock from "./TimerClock.vue";
import AppIconButton from "./ui/AppIconButton.vue";

const props = defineProps<{ session: Session; timeZone: string | null; now: number }>();
const emit = defineEmits<{ edit: [] }>();

const { t } = useI18n();

const date = computed(() => formatDate(props.session.startedAt, props.timeZone, currentLocale()));

const range = computed(() => {
  const { startedAt, endedAt } = props.session;
  if (endedAt === null) {
    return t("sessions.runningRange", { start: formatTime(startedAt, props.timeZone) });
  }
  return formatSessionRange(startedAt, endedAt, props.timeZone, currentLocale());
});

const duration = computed(() => formatDuration(props.session.durationSec, currentLocale()));
</script>

<template>
  <li class="flex items-start gap-3 border-b border-line py-3.5 last:border-0">
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-meta text-fg-subtle">{{ date }}</span>
        <span class="font-code text-body">{{ range }}</span>
        <TimerClock
          v-if="session.endedAt === null"
          :started-at="session.startedAt"
          :now
          class="ml-auto text-body"
        />
        <span v-else class="ml-auto font-code text-body">{{ duration }}</span>
      </div>
      <p
        v-if="session.note !== ''"
        class="text-body break-words whitespace-pre-wrap text-fg-muted"
        v-text="session.note"
      />
    </div>
    <AppIconButton :label="t('sessions.editAction', { date, range })" @click="emit('edit')">
      <Pencil :size="17" aria-hidden="true" />
    </AppIconButton>
  </li>
</template>
