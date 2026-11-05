<script setup lang="ts">
import { Plus } from "@lucide/vue";
import {
  tc,
  type MessageKey,
  type NotionBlockPosition,
  type NotionDatabase,
  type Project,
} from "@stt/shared";
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { currentLocale } from "../i18n.ts";
import { joinMeta } from "../meta-line.ts";
import NotionDatabaseDialog from "./NotionDatabaseDialog.vue";
import AppBadge from "./ui/AppBadge.vue";
import AppButton from "./ui/AppButton.vue";
import AppConfirmDialog from "./ui/AppConfirmDialog.vue";
import AppIsland from "./ui/AppIsland.vue";

type OpenDialog = { kind: "add" } | { kind: "configure"; database: NotionDatabase };

const props = defineProps<{ databases: NotionDatabase[]; projects: Project[] }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const titleId = useId();
const dialog = ref<OpenDialog | null>(null);
const removing = ref<NotionDatabase | null>(null);

const blockKeys = {
  start: "notionDatabases.summary.block.start",
  end: "notionDatabases.summary.block.end",
  none: "notionDatabases.summary.block.none",
} as const satisfies Record<NotionBlockPosition, MessageKey>;

const hasDefault = computed(() => props.databases.some((database) => database.isDefault));

function summary(database: NotionDatabase): string {
  const locale = currentLocale();
  const linked = props.projects.filter(
    (project) => project.notionDatabaseId === database.id,
  ).length;
  const linkedPart = linked === 0 ? [] : [tc(locale, "notionDatabases.summary.linked", linked)];
  return joinMeta(locale, [
    projectSource(database),
    t(blockKeys[database.blockPosition]),
    ...linkedPart,
  ]);
}

function projectSource(database: NotionDatabase): string {
  if (database.projectMode === "own") {
    return t("notionDatabases.summary.ownProject", { field: t("notion.property.project") });
  }
  if (database.projectMode === "property") {
    const field = database.projectProperty?.name ?? "";
    return t("notionDatabases.summary.propertyProject", { field });
  }
  return t("home.noProject");
}

function onSaved(): void {
  dialog.value = null;
  emit("changed");
}

async function removeConfirmed(): Promise<void> {
  const database = removing.value;
  removing.value = null;
  if (database === null) return;
  await api.removeNotionDatabase(database.id);
  emit("changed");
}
</script>

<template>
  <AppIsland as="section" :aria-labelledby="titleId">
    <div class="flex flex-wrap items-center gap-3 pb-2">
      <h2 :id="titleId" class="text-title">{{ t("notionDatabases.title") }}</h2>
      <AppButton
        variant="outline-primary"
        size="sm"
        class="ml-auto"
        @click="dialog = { kind: 'add' }"
      >
        <Plus :size="17" aria-hidden="true" />
        {{ t("notionDatabases.add") }}
      </AppButton>
    </div>
    <ul v-if="databases.length > 0">
      <li
        v-for="database in databases"
        :key="database.id"
        class="flex min-h-16 flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line py-2.5"
      >
        <div class="min-w-0 flex-[1_1_260px]">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="min-w-0 text-body font-semibold break-words">{{ database.title }}</span>
            <AppBadge v-if="database.isDefault">{{ t("notionDatabases.default") }}</AppBadge>
          </div>
          <p class="mt-0.5 text-meta break-words text-fg-subtle">{{ summary(database) }}</p>
        </div>
        <div class="flex gap-2">
          <AppButton
            variant="outline-gray"
            size="sm"
            :aria-label="t('notionDatabases.configureItem', { title: database.title })"
            @click="dialog = { kind: 'configure', database }"
          >
            {{ t("notionDatabases.configure") }}
          </AppButton>
          <AppButton
            variant="outline-gray"
            size="sm"
            :aria-label="t('notionDatabases.removeItem', { title: database.title })"
            @click="removing = database"
          >
            {{ t("notionDatabases.remove") }}
          </AppButton>
        </div>
      </li>
    </ul>
    <NotionDatabaseDialog
      v-if="dialog"
      :database="dialog.kind === 'configure' ? dialog.database : undefined"
      :has-default="hasDefault"
      @close="dialog = null"
      @saved="onSaved"
    />
    <AppConfirmDialog
      v-if="removing"
      :title="t('notionDatabases.removeQuestion')"
      :confirm-label="t('notionDatabases.remove')"
      @confirm="removeConfirmed"
      @close="removing = null"
    />
  </AppIsland>
</template>
