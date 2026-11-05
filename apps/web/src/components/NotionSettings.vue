<script setup lang="ts">
import { formatDate, tc, type MessageKey, type NotionConnection } from "@stt/shared";
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import * as api from "../api.ts";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";
import AppButton from "./ui/AppButton.vue";
import AppConfirmDialog from "./ui/AppConfirmDialog.vue";
import AppFormError from "./ui/AppFormError.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppSkeleton from "./ui/AppSkeleton.vue";

const CONNECT_PATH = "/notion/oauth/start";

const props = defineProps<{ connection: NotionConnection | null; loaded: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const route = useRoute();
const account = useSessionStore();
const titleId = useId();
const confirmingDisconnect = ref(false);

const justConnected = computed(() => route.query.notion === "connected");
const connectError = computed((): MessageKey | undefined => {
  const error = route.query.notion_error;
  if (typeof error !== "string") return undefined;
  return error === "cancelled" ? "notion.error.cancelled" : "notion.error.failed";
});

const workspaceInitial = computed(() => {
  const [initial = ""] = Array.from(props.connection?.workspaceName.trim() ?? "");
  return initial.toLocaleUpperCase();
});

const access = computed(() => {
  if (props.connection === null) return "";
  const locale = currentLocale();
  const timeZone = account.user?.timezone ?? null;
  return tc(locale, "notion.since", props.connection.databases.length, {
    date: formatDate(props.connection.createdAt, timeZone, locale),
  });
});

async function disconnect(): Promise<void> {
  confirmingDisconnect.value = false;
  await api.disconnectNotion();
  emit("changed");
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
          <div class="flex min-w-0 flex-[1_1_260px] items-center gap-3.5">
            <span
              aria-hidden="true"
              class="flex size-11 flex-none items-center justify-center rounded-field bg-surface-page text-title font-extrabold"
            >
              {{ workspaceInitial }}
            </span>
            <div class="min-w-0">
              <p class="text-body break-words">
                {{ t("notion.connectedTo", { workspace: connection.workspaceName }) }}
              </p>
              <p class="text-meta text-fg-subtle">{{ access }}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <AppButton :href="CONNECT_PATH">{{ t("notion.reconnect") }}</AppButton>
            <AppButton variant="ghost-danger" @click="confirmingDisconnect = true">
              {{ t("notion.disconnect") }}
            </AppButton>
          </div>
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
</template>
