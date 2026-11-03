<script setup lang="ts">
import type { NotionDatabase } from "@stt/shared";
import { Plus } from "@lucide/vue";
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import NotionDatabaseDialog from "./NotionDatabaseDialog.vue";
import AppBadge from "./ui/AppBadge.vue";
import AppButton from "./ui/AppButton.vue";
import AppConfirmDialog from "./ui/AppConfirmDialog.vue";
import AppIsland from "./ui/AppIsland.vue";

type OpenDialog = { kind: "add" } | { kind: "configure"; database: NotionDatabase };

const props = defineProps<{ databases: NotionDatabase[] }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const titleId = useId();
const dialog = ref<OpenDialog | null>(null);
const removing = ref<NotionDatabase | null>(null);

const hasDefault = computed(() => props.databases.some((database) => database.isDefault));

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
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 :id="titleId" class="text-title">{{ t("notionDatabases.title") }}</h2>
      <AppButton variant="outline-primary" size="sm" @click="dialog = { kind: 'add' }">
        <Plus :size="17" aria-hidden="true" />
        {{ t("notionDatabases.add") }}
      </AppButton>
    </div>
    <ul v-if="databases.length > 0" class="mt-2">
      <li
        v-for="database in databases"
        :key="database.id"
        class="flex flex-wrap items-center gap-3 border-b border-line py-3.5 last:border-0"
      >
        <span class="min-w-0 text-body font-semibold break-words">{{ database.title }}</span>
        <AppBadge v-if="database.isDefault">{{ t("notionDatabases.default") }}</AppBadge>
        <div class="ml-auto flex gap-2">
          <AppButton
            variant="outline-primary"
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
