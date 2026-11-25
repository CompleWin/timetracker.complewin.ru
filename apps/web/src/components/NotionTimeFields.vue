<script setup lang="ts">
import {
  notionTimeFields,
  type NotionColumn,
  type NotionTimeField,
  type NotionTimeFieldChoice,
  type NotionTimeFieldChoices,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import NotionTimeColumn from "./NotionTimeColumn.vue";
import RadioChips from "./RadioChips.vue";
import AppCheckbox from "./ui/AppCheckbox.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";

const props = defineProps<{
  columns: NotionColumn[];
  errors: Partial<Record<NotionTimeField, string>>;
  disabled: boolean;
}>();

const choices = defineModel<NotionTimeFieldChoices>({ required: true });
const durationEnabled = defineModel<boolean>("durationEnabled", { required: true });

type DurationFormat = "" | "spent" | "spentHours";

const otherFields = ["running", "lastTracked"] as const;
const { t } = useI18n();
const formats = computed<{ value: DurationFormat; label: string }[]>(() => [
  { value: "spent", label: t("notionDatabases.timeField.durationText") },
  { value: "spentHours", label: t("notionDatabases.timeField.durationHours") },
]);
const fields = computed(() =>
  otherFields.map((field) => ({ field, choice: choices.value[field] })),
);
const duration = computed(() => {
  const { spent, spentHours } = choices.value;
  if (spent !== undefined && spentHours === undefined) {
    return { field: "spent" as const, choice: spent };
  }
  if (spentHours !== undefined && spent === undefined) {
    return { field: "spentHours" as const, choice: spentHours };
  }
  return undefined;
});
const savedDurationColumns = computed(() => {
  const { spent, spentHours } = choices.value;
  if (spent?.mode !== "existing" || spentHours?.mode !== "existing") return undefined;
  return {
    text: columnName(spent.propertyId),
    hours: columnName(spentHours.propertyId),
  };
});

function columnName(id: string): string {
  return (
    props.columns.find((column) => column.id === id)?.name ??
    t("notionDatabases.timeField.unavailable")
  );
}

function choose(field: NotionTimeField, choice: NotionTimeFieldChoice): void {
  choices.value = { ...choices.value, [field]: choice };
}

function newColumn(field: NotionTimeField): NotionTimeFieldChoice {
  return { mode: "create", name: t(`notion.property.${field}`) };
}

function withoutFields(...excluded: NotionTimeField[]): NotionTimeFieldChoices {
  const remaining: NotionTimeFieldChoices = {};
  for (const field of notionTimeFields) {
    const choice = choices.value[field];
    if (choice !== undefined && !excluded.includes(field)) remaining[field] = choice;
  }
  return remaining;
}

function toggleDuration(enabled: boolean): void {
  durationEnabled.value = enabled;
  if (!enabled) choices.value = withoutFields("spent", "spentHours");
}

function setDurationFormat(format: DurationFormat): void {
  if (format === "") return;
  const choice = choices.value[format] ?? newColumn(format);
  choices.value = { ...withoutFields("spent", "spentHours"), [format]: choice };
}

function toggle(field: NotionTimeField, enabled: boolean): void {
  if (enabled) {
    choose(field, newColumn(field));
  } else {
    choices.value = withoutFields(field);
  }
}
</script>

<template>
  <fieldset class="min-w-0" :disabled>
    <legend class="mb-2">
      <AppSectionLabel>{{ t("notionDatabases.timeFields") }}</AppSectionLabel>
    </legend>
    <div class="flex flex-col gap-2">
      <div role="group" :aria-label="t('notion.property.spent')">
        <AppCheckbox
          :model-value="durationEnabled"
          :label="t('notion.property.spent')"
          @update:model-value="toggleDuration"
        />
        <div v-if="durationEnabled" class="my-2 ml-2 flex flex-col gap-3 border-l border-line pl-3">
          <p v-if="savedDurationColumns" class="text-meta text-fg-subtle">
            {{ t("notionDatabases.timeField.savedDurationFormats", savedDurationColumns) }}
          </p>
          <RadioChips
            :model-value="duration?.field ?? ''"
            :legend="t('notionDatabases.timeField.durationFormat')"
            :options="formats"
            @update:model-value="setDurationFormat"
          />
          <NotionTimeColumn
            v-if="duration !== undefined"
            :key="duration.field"
            :field="duration.field"
            :model-value="duration.choice"
            :columns
            :error="errors[duration.field]"
            @update:model-value="choose(duration.field, $event)"
          />
        </div>
      </div>
      <div
        v-for="{ field, choice } in fields"
        :key="field"
        role="group"
        :aria-label="t(`notion.property.${field}`)"
      >
        <AppCheckbox
          :model-value="choice !== undefined"
          :label="t(`notion.property.${field}`)"
          @update:model-value="toggle(field, $event)"
        />
        <NotionTimeColumn
          v-if="choice !== undefined"
          :field
          :model-value="choice"
          :columns
          :error="errors[field]"
          class="my-2 ml-2 border-l border-line pl-3"
          @update:model-value="choose(field, $event)"
        />
      </div>
    </div>
  </fieldset>
</template>
