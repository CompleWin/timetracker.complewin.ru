<script setup lang="ts">
import type { NotionConnection, Project } from "@stt/shared";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import LanguageSettings from "../components/LanguageSettings.vue";
import NotionDatabases from "../components/NotionDatabases.vue";
import NotionSettings from "../components/NotionSettings.vue";
import SettingsNav, { type SettingsSection } from "../components/SettingsNav.vue";

const NOTION_ID = "notion";
const NOTION_DATABASES_ID = "notion-databases";
const LANGUAGE_ID = "language";

const { t } = useI18n();
const connection = ref<NotionConnection | null>(null);
const projects = ref<Project[]>([]);
const loaded = ref(false);
const selectedId = ref<string | null>(null);

const sections = computed<SettingsSection[]>(() => [
  { id: NOTION_ID, title: t("notion.title") },
  ...(connection.value?.status === "ok"
    ? [{ id: NOTION_DATABASES_ID, title: t("notionDatabases.title") }]
    : []),
  { id: LANGUAGE_ID, title: t("language.label") },
]);
const currentId = computed(
  () =>
    sections.value.find((section) => section.id === selectedId.value)?.id ?? sections.value[0]?.id,
);

onMounted(async () => {
  await reload();
  if (connection.value !== null) await checkAccess();
});
useAutoRefresh(reload);

async function reload(): Promise<void> {
  const [loadedConnection, activeProjects] = await Promise.all([
    api.fetchNotionConnection(),
    api.fetchProjects("false"),
  ]);
  connection.value = loadedConnection;
  projects.value = activeProjects;
  loaded.value = true;
}

async function checkAccess(): Promise<void> {
  const checked = await api.checkNotionConnection().catch(() => undefined);
  if (checked !== undefined) connection.value = checked;
}

function showSection(id: string): void {
  selectedId.value = id;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
}
</script>

<template>
  <h1 class="text-h2">{{ t("header.settings") }}</h1>
  <div class="flex items-start gap-8">
    <SettingsNav :sections :current="currentId" @select="showSection" />
    <div class="flex min-w-0 flex-1 flex-col gap-5">
      <NotionSettings :id="NOTION_ID" :connection :loaded class="scroll-mt-4" @changed="reload" />
      <NotionDatabases
        v-if="connection?.status === 'ok'"
        :id="NOTION_DATABASES_ID"
        :databases="connection.databases"
        :projects
        class="scroll-mt-4"
        @changed="reload"
      />
      <LanguageSettings :id="LANGUAGE_ID" class="scroll-mt-4" />
    </div>
  </div>
</template>
