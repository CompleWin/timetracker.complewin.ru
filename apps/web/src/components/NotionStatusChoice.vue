<script setup lang="ts">
import type { NotionStatus } from "@stt/shared";
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import AppCheckbox from "./ui/AppCheckbox.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";
import AppTooltip from "./ui/AppTooltip.vue";

defineProps<{ statuses: NotionStatus[] }>();

const skippedIds = defineModel<string[]>({ required: true });
const { t } = useI18n();
const legendId = useId();

function setImported(id: string, imported: boolean): void {
  const others = skippedIds.value.filter((skippedId) => skippedId !== id);
  skippedIds.value = imported ? others : [...others, id];
}
</script>

<template>
  <fieldset :aria-labelledby="legendId">
    <legend class="relative mb-2 flex items-center gap-2">
      <AppSectionLabel :id="legendId">{{ t("notionDatabases.importStatuses") }}</AppSectionLabel>
      <AppTooltip
        :subject="t('notionDatabases.importStatuses')"
        :text="t('notionDatabases.hint.importStatuses')"
      />
    </legend>
    <div class="flex flex-col gap-2">
      <AppCheckbox
        v-for="status in statuses"
        :key="status.id"
        :model-value="!skippedIds.includes(status.id)"
        :label="status.name"
        @update:model-value="setImported(status.id, $event)"
      />
    </div>
    <p class="mt-2 text-meta text-fg-subtle">{{ t("notionDatabases.importStatusesNote") }}</p>
  </fieldset>
</template>
