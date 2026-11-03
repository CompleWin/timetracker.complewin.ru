<script setup lang="ts">
import type { MessageKey, NotionConnection } from "@stt/shared";
import { computed, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import NotionDatabases from "./NotionDatabases.vue";
import AppButton from "./ui/AppButton.vue";
import AppConfirmDialog from "./ui/AppConfirmDialog.vue";
import AppFormError from "./ui/AppFormError.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppSkeleton from "./ui/AppSkeleton.vue";

const CONNECT_PATH = "/notion/oauth/start";

const { t } = useI18n();
const route = useRoute();
const titleId = useId();
const connection = ref<NotionConnection | null>(null);
const loaded = ref(false);
const confirmingDisconnect = ref(false);

const justConnected = computed(() => route.query.notion === "connected");
const connectError = computed((): MessageKey | undefined => {
  const error = route.query.notion_error;
  if (typeof error !== "string") return undefined;
  return error === "cancelled" ? "notion.error.cancelled" : "notion.error.failed";
});

onMounted(async () => {
  await reload();
  if (connection.value !== null) await checkAccess();
});
useAutoRefresh(reload);

async function reload(): Promise<void> {
  connection.value = await api.fetchNotionConnection();
  loaded.value = true;
}

async function checkAccess(): Promise<void> {
  const checked = await api.checkNotionConnection().catch(() => undefined);
  if (checked !== undefined) connection.value = checked;
}

async function disconnect(): Promise<void> {
  confirmingDisconnect.value = false;
  await api.disconnectNotion();
  connection.value = null;
}
</script>

<template>
  <AppIsland as="section" :aria-labelledby="titleId">
    <h2 :id="titleId" class="text-title">{{ t("notion.title") }}</h2>
    <div class="mt-4 flex flex-col gap-4">
      <p
        v-if="justConnected"
        role="status"
        class="rounded-field border border-success bg-success-soft px-4 py-3 text-small text-success-hover"
      >
        {{ t("notion.connected") }}
      </p>
      <AppFormError v-if="connectError" placement="form">{{ t(connectError) }}</AppFormError>
      <AppSkeleton v-if="!loaded" :lines="2" />
      <div v-else class="flex flex-wrap items-center justify-between gap-4">
        <template v-if="connection === null">
          <p class="text-body">{{ t("notion.notConnected") }}</p>
          <AppButton :href="CONNECT_PATH">{{ t("notion.connect") }}</AppButton>
        </template>
        <template v-else-if="connection.status === 'needs_reauth'">
          <p class="text-body text-danger-ink">{{ t("notion.needsReauth") }}</p>
          <AppButton :href="CONNECT_PATH">{{ t("notion.reconnect") }}</AppButton>
        </template>
        <template v-else>
          <p class="min-w-0 text-body break-words">
            {{ t("notion.connectedTo", { workspace: connection.workspaceName }) }}
          </p>
          <AppButton variant="outline-gray" @click="confirmingDisconnect = true">
            {{ t("notion.disconnect") }}
          </AppButton>
        </template>
      </div>
    </div>
    <AppConfirmDialog
      v-if="confirmingDisconnect"
      :title="t('notion.disconnectQuestion')"
      :confirm-label="t('notion.disconnect')"
      @confirm="disconnect"
      @close="confirmingDisconnect = false"
    />
  </AppIsland>
  <NotionDatabases
    v-if="connection?.status === 'ok'"
    :databases="connection.databases"
    @changed="reload"
  />
</template>
