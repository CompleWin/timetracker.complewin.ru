<script setup lang="ts">
import { Check, ExternalLink } from "@lucide/vue";
import { formatDuration, REMINDER_THRESHOLD_OPTIONS_MIN, t as translate } from "@stt/shared";
import { computed, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";
import RadioChips from "./RadioChips.vue";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";

const SECONDS_PER_MINUTE = 60;

const { t } = useI18n();
const session = useSessionStore();
const titleId = useId();
const botUsername = ref<string | null>(null);

const thresholdOptions = computed(() =>
  REMINDER_THRESHOLD_OPTIONS_MIN.map((minutes) => ({
    value: String(minutes),
    label: minutes === 0 ? t("botSettings.thresholdOff") : durationOf(minutes),
  })),
);

const threshold = computed({
  get: () => String(session.user?.reminderThresholdMin ?? 0),
  set: (value: string) => session.changeReminderThreshold(Number(value)),
});

const thresholdHint = computed(() => {
  const minutes = Number(threshold.value);
  if (minutes === 0) return t("botSettings.hintOff");
  return t("botSettings.hint", { duration: durationOf(minutes) });
});

const openBotLabel = computed(() =>
  translate(currentLocale(), "botSettings.openBot", { username: botUsername.value ?? "" }),
);

onMounted(async () => {
  botUsername.value = await api.fetchBotUsername();
});

function durationOf(minutes: number): string {
  return formatDuration(minutes * SECONDS_PER_MINUTE, currentLocale());
}
</script>

<template>
  <AppIsland as="section" :aria-labelledby="titleId">
    <h2 :id="titleId" class="text-title">{{ t("botSettings.title") }}</h2>
    <p
      v-if="session.user?.botCanMessage"
      class="mt-2 flex items-center gap-2 text-body text-success-hover"
    >
      <Check :size="17" aria-hidden="true" />
      {{ t("botSettings.canMessage") }}
    </p>
    <div v-else class="mt-2 flex flex-col items-start gap-3">
      <p class="text-body text-fg-muted">{{ t("botSettings.cannotMessage") }}</p>
      <AppButton
        v-if="botUsername !== null"
        variant="outline-primary"
        size="sm"
        :href="`https://t.me/${botUsername}`"
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink :size="17" aria-hidden="true" />
        {{ openBotLabel }}
      </AppButton>
    </div>
    <RadioChips
      v-model="threshold"
      :legend="t('botSettings.threshold')"
      :options="thresholdOptions"
      class="mt-5"
    />
    <p class="mt-2.5 text-meta text-fg-subtle">{{ thresholdHint }}</p>
  </AppIsland>
</template>
