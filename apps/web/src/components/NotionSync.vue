<script setup lang="ts">
import { formatDateTime, type SyncStatus } from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";

const props = defineProps<{ status: SyncStatus }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const account = useSessionStore();
const titleId = useId();
const errorsId = useId();

const lastRun = computed(() => {
  const lastRunAt = props.status.lastRunAt;
  if (lastRunAt === null) return null;
  const timeZone = account.user?.timezone ?? null;
  return formatDateTime(lastRunAt, timeZone, currentLocale());
});

async function retry(): Promise<void> {
  await api.retrySync();
  emit("changed");
}
</script>

<template>
  <AppIsland as="section" :aria-labelledby="titleId">
    <h2 :id="titleId" class="text-title">{{ t("notionSync.title") }}</h2>
    <div class="mt-4 flex flex-col gap-4">
      <div class="text-body text-fg-muted">
        <p>{{ t("notionSync.pending", { count: status.pendingTasks }) }}</p>
        <p v-if="lastRun !== null">{{ t("notionSync.lastRun", { dateTime: lastRun }) }}</p>
      </div>
      <div v-if="status.failed.length > 0" class="flex flex-col gap-2">
        <AppSectionLabel :id="errorsId" as="h3">{{ t("notionSync.errors") }}</AppSectionLabel>
        <ul :aria-labelledby="errorsId">
          <li
            v-for="failure in status.failed"
            :key="failure.taskId"
            class="border-t border-line py-2.5"
          >
            <p class="text-body font-semibold break-words">{{ failure.title }}</p>
            <p class="text-meta break-words text-danger-ink">{{ failure.error }}</p>
          </li>
        </ul>
        <AppButton variant="outline-primary" size="sm" class="self-start" @click="retry">
          {{ t("notionSync.retry") }}
        </AppButton>
      </div>
    </div>
  </AppIsland>
</template>
