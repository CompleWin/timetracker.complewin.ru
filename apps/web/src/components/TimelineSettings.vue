<script setup lang="ts">
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import { NetworkError } from "../api.ts";
import { isOnline } from "../connection.ts";
import { useSessionStore } from "../stores/session.ts";
import AppCheckbox from "./ui/AppCheckbox.vue";
import AppIsland from "./ui/AppIsland.vue";

const { t } = useI18n();
const session = useSessionStore();
const titleId = useId();

async function changeShowGaps(showGaps: boolean): Promise<void> {
  try {
    await session.changeShowGaps(showGaps);
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error;
  }
}
</script>

<template>
  <AppIsland as="section" :aria-labelledby="titleId">
    <h2 :id="titleId" class="text-title">{{ t("timelineSettings.title") }}</h2>
    <AppCheckbox
      :model-value="session.user?.showGaps ?? true"
      :label="t('timelineSettings.showGaps')"
      :disabled="!isOnline || session.savingShowGaps"
      class="mt-4"
      @update:model-value="changeShowGaps"
    />
    <p class="mt-1.5 ml-7 text-meta text-fg-subtle">{{ t("timelineSettings.showGapsNote") }}</p>
  </AppIsland>
</template>
