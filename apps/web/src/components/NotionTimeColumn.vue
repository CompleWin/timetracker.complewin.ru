<script setup lang="ts">
import {
  notionTimeFieldTypes,
  type NotionColumn,
  type NotionTimeField,
  type NotionTimeFieldChoice,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import RadioChips from "./RadioChips.vue";
import AppField from "./ui/AppField.vue";

const props = defineProps<{
  field: NotionTimeField;
  columns: NotionColumn[];
  error?: string;
}>();

const choice = defineModel<NotionTimeFieldChoice>({ required: true });
const { t } = useI18n();
const modes = computed(() => [
  { value: "create" as const, label: t("notionDatabases.timeField.create") },
  { value: "existing" as const, label: t("notionDatabases.timeField.existing") },
]);
const compatibleColumns = computed(() =>
  props.columns.filter(({ type }) => type === notionTimeFieldTypes[props.field]),
);
const unavailableSelection = computed(() => {
  const selected = choice.value;
  return (
    selected.mode === "existing" &&
    selected.propertyId !== "" &&
    !compatibleColumns.value.some(({ id }) => id === selected.propertyId)
  );
});

function setMode(mode: NotionTimeFieldChoice["mode"]): void {
  choice.value =
    mode === "create"
      ? { mode, name: t(`notion.property.${props.field}`) }
      : { mode, propertyId: "" };
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <RadioChips
      :model-value="choice.mode"
      :legend="t('notionDatabases.timeField.column')"
      legend-hidden
      :options="modes"
      @update:model-value="setMode"
    />
    <AppField
      v-if="choice.mode === 'create'"
      :model-value="choice.name"
      :label="t('notionDatabases.timeField.name')"
      :error
      @update:model-value="choice = { mode: 'create', name: $event }"
    />
    <AppField
      v-else
      kind="select"
      :model-value="choice.propertyId"
      :label="t('notionDatabases.timeField.column')"
      :error
      @update:model-value="choice = { mode: 'existing', propertyId: $event }"
    >
      <option value="" disabled>{{ t("notionDatabases.timeField.select") }}</option>
      <option v-if="unavailableSelection" :value="choice.propertyId" disabled>
        {{ t("notionDatabases.timeField.unavailable") }}
      </option>
      <option v-for="column in compatibleColumns" :key="column.id" :value="column.id">
        {{ column.name }}
      </option>
    </AppField>
  </div>
</template>
