<script setup lang="ts">
import { Pencil } from "@lucide/vue";
import { formatDate, formatDuration, formatTime, type Session } from "@stt/shared";
import { computed } from "vue";
import { I18nT, useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import { sessionRange } from "../session-range.ts";
import TimerClock from "./TimerClock.vue";
import AppIconButton from "./ui/AppIconButton.vue";

const props = defineProps<{ session: Session; timeZone: string | null; now: number }>();
const emit = defineEmits<{ edit: [] }>();

const { t } = useI18n();

const isRunning = computed(() => props.session.endedAt === null);
const start = computed(() => formatTime(props.session.startedAt, props.timeZone));
const range = computed(() => sessionRange(props.session, props.timeZone, currentLocale()));
const duration = computed(() => formatDuration(props.session.durationSec, currentLocale()));

const editLabel = computed(() =>
  t("sessions.editAction", {
    date: formatDate(props.session.startedAt, props.timeZone, currentLocale()),
    range: range.value,
  }),
);
</script>

<template>
  <li class="border-t border-line pt-2 pb-3">
    <div class="flex items-center gap-3">
      <I18nT
        v-if="isRunning"
        keypath="sessions.runningRange"
        tag="span"
        scope="global"
        class="font-code text-body whitespace-nowrap"
      >
        <template #start>{{ start }}</template>
        <template #running>
          <span class="text-primary">{{ t("sessions.running") }}</span>
        </template>
      </I18nT>
      <span v-else class="font-code text-body whitespace-nowrap">{{ range }}</span>
      <TimerClock
        v-if="isRunning"
        :started-at="session.startedAt"
        :now
        class="ml-auto text-small tabular-nums"
      />
      <span v-else class="ml-auto font-code text-small whitespace-nowrap tabular-nums">
        {{ duration }}
      </span>
      <AppIconButton :label="editLabel" class="-mr-2" @click="emit('edit')">
        <Pencil :size="17" aria-hidden="true" />
      </AppIconButton>
    </div>
    <p
      class="mt-0.5 text-body break-words whitespace-pre-wrap"
      :class="session.note === '' ? 'text-fg-faint' : 'text-fg-muted'"
      v-text="session.note === '' ? t('sessions.noNote') : session.note"
    />
  </li>
</template>
