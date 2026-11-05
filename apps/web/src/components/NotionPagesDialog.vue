<script setup lang="ts">
import type { NotionDatabase, NotionPage, Project } from "@stt/shared";
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import AppBadge from "./ui/AppBadge.vue";
import AppButton from "./ui/AppButton.vue";
import AppCheckbox from "./ui/AppCheckbox.vue";
import AppField from "./ui/AppField.vue";
import AppModal from "./ui/AppModal.vue";

const SEARCH_DELAY_MS = 300;

const props = defineProps<{ databases: NotionDatabase[]; projects: Project[] }>();
const emit = defineEmits<{ close: []; linked: [] }>();

const { t } = useI18n();
const databaseId = ref(
  (props.databases.find((database) => database.isDefault) ?? props.databases[0])?.id ?? "",
);
const query = ref("");
const includeCompleted = ref(false);
const projectId = ref("");
const pages = ref<NotionPage[]>([]);
const linking = ref<string>();
let latestSearch = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch([databaseId, includeCompleted], loadPages, { immediate: true });
watch(query, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadPages, SEARCH_DELAY_MS);
});

onBeforeUnmount(() => clearTimeout(searchTimer));

async function loadPages(): Promise<void> {
  clearTimeout(searchTimer);
  const searchNumber = ++latestSearch;
  const found = await api.fetchNotionPages({
    databaseId: databaseId.value,
    q: query.value,
    includeCompleted: includeCompleted.value,
  });
  if (searchNumber === latestSearch) pages.value = found;
}

async function addPage(page: NotionPage): Promise<void> {
  linking.value = page.pageId;
  try {
    const body = projectId.value === "" ? {} : { projectId: projectId.value };
    const task = await api.linkNotionPage(page.pageId, body);
    pages.value = pages.value.map((item) =>
      item.pageId === page.pageId ? { ...item, linkedTaskId: task.id } : item,
    );
    emit("linked");
  } catch (error) {
    if (!api.isApiError(error, "already_linked")) throw error;
    await loadPages();
  } finally {
    linking.value = undefined;
  }
}
</script>

<template>
  <AppModal wide :title="t('notionPages.title')" @close="emit('close')">
    <div class="flex flex-col gap-5">
      <AppField v-model="databaseId" kind="select" :label="t('notionPages.database')">
        <option v-for="database in databases" :key="database.id" :value="database.id">
          {{ database.title }}
        </option>
      </AppField>
      <AppField v-model="query" kind="search" :label="t('notionPages.search')" />
      <AppCheckbox v-model="includeCompleted" :label="t('notionPages.includeCompleted')" />
      <AppField v-model="projectId" kind="select" :label="t('notionPages.project')">
        <option value="">{{ t("notionPages.autoProject") }}</option>
        <option v-for="project in projects" :key="project.id" :value="project.id">
          {{ project.name }}
        </option>
      </AppField>
      <ul
        v-if="pages.length > 0"
        class="max-h-[min(320px,40vh)] overflow-y-auto rounded-panel border border-line bg-surface-muted px-4"
      >
        <li
          v-for="page in pages"
          :key="page.pageId"
          class="flex min-h-[54px] items-center gap-3 border-b border-line py-2 last:border-b-0"
        >
          <span class="min-w-0 flex-1 text-body break-words text-fg">{{ page.title }}</span>
          <AppBadge v-if="page.linkedTaskId !== null" tone="muted">
            {{ t("notionPages.linked") }}
          </AppBadge>
          <AppButton
            v-else
            variant="outline-primary"
            size="sm"
            :aria-label="t('notionPages.addItem', { title: page.title })"
            :disabled="linking !== undefined"
            @click="addPage(page)"
          >
            {{ t("notionPages.add") }}
          </AppButton>
        </li>
      </ul>
    </div>
  </AppModal>
</template>
