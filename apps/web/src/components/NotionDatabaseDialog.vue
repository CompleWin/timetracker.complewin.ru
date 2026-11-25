<script setup lang="ts">
import {
  notionBlockPositions,
  notionProjectModes,
  notionTimeFields,
  notionTimeFieldTypes,
  type AvailableNotionDatabase,
  type NotionBlockPosition,
  type NotionColumn,
  type NotionDatabase,
  type NotionProjectMode,
  type NotionProperty,
  type NotionStatus,
  type NotionTimeField,
  type NotionTimeFieldChoice,
  type NotionTimeFieldChoices,
} from "@stt/shared";
import { RefreshCw } from "@lucide/vue";
import { computed, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import NotionStatusChoice from "./NotionStatusChoice.vue";
import NotionTimeFields from "./NotionTimeFields.vue";
import RadioChips from "./RadioChips.vue";
import AppButton from "./ui/AppButton.vue";
import AppField from "./ui/AppField.vue";
import AppFormError from "./ui/AppFormError.vue";
import AppModal from "./ui/AppModal.vue";

const props = defineProps<{ database?: NotionDatabase }>();
const emit = defineEmits<{ close: []; saved: [database: NotionDatabase] }>();

const { t } = useI18n();
const formId = useId();
const available = ref<AvailableNotionDatabase[]>([]);
const dataSourceId = ref(props.database?.dataSourceId ?? "");
const projectMode = ref<NotionProjectMode>(props.database?.projectMode ?? "own");
const properties = ref<NotionProperty[]>([]);
const columns = ref<NotionColumn[]>();
const columnsFailed = ref(false);
const projectPropertyId = ref(props.database?.projectProperty?.id ?? "");
const statuses = ref<NotionStatus[]>([]);
const skippedStatusIds = ref(props.database?.skippedStatusIds ?? []);
const blockPosition = ref<NotionBlockPosition>(props.database?.blockPosition ?? "start");
const storedTimeFields = props.database?.timeFields ?? {};
const timeFields = ref<NotionTimeFieldChoices>(existingTimeFields());
const durationEnabled = ref(
  storedTimeFields.spent !== undefined || storedTimeFields.spentHours !== undefined,
);
const formError = ref<string>();
const saving = ref(false);
let propertyLoad = 0;

const isNew = computed(() => props.database === undefined);
const notAdded = computed(() => available.value.filter((source) => source.addedId === null));
const takesProperty = computed(() => projectMode.value === "property");
const timeFieldsChanged = computed(
  () =>
    isNew.value ||
    notionTimeFields.some((field) => {
      const choice = timeFields.value[field];
      return choice?.mode === "create" || choice?.propertyId !== storedTimeFields[field];
    }),
);
const hasTimeFields = computed(() => Object.keys(timeFields.value).length > 0);
const timeFieldErrors = computed(() => {
  const errors: Partial<Record<NotionTimeField, string>> = {};
  for (const field of notionTimeFields) {
    const choice = timeFields.value[field];
    if (choice === undefined) continue;
    const error = timeFieldError(field, choice);
    if (error !== undefined) errors[field] = error;
  }
  return errors;
});
const timeFieldsReady = computed(
  () =>
    !timeFieldsChanged.value ||
    !hasTimeFields.value ||
    (columns.value !== undefined &&
      Object.keys(timeFieldErrors.value).length === 0 &&
      Object.values(timeFields.value).every(
        (choice) => choice.mode === "create" || choice.propertyId !== "",
      )),
);
const canSave = computed(
  () =>
    dataSourceId.value !== "" &&
    (!takesProperty.value || projectPropertyId.value !== "") &&
    (!durationEnabled.value ||
      timeFields.value.spent !== undefined ||
      timeFields.value.spentHours !== undefined) &&
    timeFieldsReady.value &&
    !saving.value,
);

const projectModeOptions = computed(() =>
  notionProjectModes.map((value) => ({ value, label: t(`notionDatabases.projectMode.${value}`) })),
);
const blockPositionOptions = computed(() =>
  notionBlockPositions.map((value) => ({
    value,
    label: t(`notionDatabases.blockPosition.${value}`),
  })),
);
onMounted(async () => {
  if (isNew.value) await refreshAvailable();
});

watch(
  dataSourceId,
  async () => {
    if (isNew.value) {
      timeFields.value = {};
      durationEnabled.value = false;
    }
    await loadProperties(true);
  },
  { immediate: true },
);

watch(projectMode, chooseProjectProperty);

watch([dataSourceId, projectMode, projectPropertyId, timeFields], () => {
  formError.value = undefined;
});

async function refreshAvailable(): Promise<void> {
  available.value = await api.fetchAvailableNotionDatabases();
  if (!notAdded.value.some((source) => source.dataSourceId === dataSourceId.value)) {
    dataSourceId.value = notAdded.value[0]?.dataSourceId ?? "";
  } else {
    await loadProperties(false);
  }
}

async function loadProperties(changedSource: boolean): Promise<void> {
  const load = ++propertyLoad;
  const source = dataSourceId.value;
  if (changedSource) {
    properties.value = [];
    statuses.value = [];
    columns.value = undefined;
  }
  columnsFailed.value = false;
  if (source === "") return;
  const loaded = await api.fetchNotionDatabaseProperties(source).catch(() => undefined);
  if (load !== propertyLoad || source !== dataSourceId.value) return;
  if (loaded === undefined) {
    columnsFailed.value = true;
    return;
  }
  properties.value = loaded.properties;
  columns.value = loaded.columns;
  statuses.value = loaded.statuses;
  if (changedSource && isNew.value) skippedStatusIds.value = completeStatusIds(loaded.statuses);
  chooseProjectProperty();
}

function existingTimeFields(): NotionTimeFieldChoices {
  const choices: NotionTimeFieldChoices = {};
  for (const field of notionTimeFields) {
    const propertyId = storedTimeFields[field];
    if (propertyId !== undefined) choices[field] = { mode: "existing", propertyId };
  }
  return choices;
}

function timeFieldError(field: NotionTimeField, choice: NotionTimeFieldChoice): string | undefined {
  const type = notionTimeFieldTypes[field];
  if (choice.mode === "existing") {
    if (choice.propertyId === "" || columns.value === undefined) return undefined;
    const column = columns.value.find(({ id }) => id === choice.propertyId);
    return column?.type === type ? undefined : t("notionDatabases.timeField.unavailable");
  }

  const name = choice.name.trim();
  if (name === "") return t("notionDatabases.error.timeFieldName");
  const column = columns.value?.find((column) => column.name === name || column.id === name);
  if (column !== undefined) {
    const key = column.type === type ? "timeFieldExists" : "timeFieldTypeConflict";
    return t(`notionDatabases.error.${key}`, { name: column.name });
  }
  const duplicate = notionTimeFields.some((other) => {
    const selected = timeFields.value[other];
    return other !== field && selected?.mode === "create" && selected.name.trim() === name;
  });
  return duplicate ? t("notionDatabases.error.timeFieldDuplicate", { name }) : undefined;
}

function completeStatusIds(options: NotionStatus[]): string[] {
  return options.filter(({ complete }) => complete).map(({ id }) => id);
}

function chooseProjectProperty(): void {
  if (!takesProperty.value) return;
  if (!properties.value.some((property) => property.id === projectPropertyId.value)) {
    projectPropertyId.value = properties.value[0]?.id ?? "";
  }
}

async function save(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  try {
    emit("saved", await saveDatabase());
  } catch (error) {
    const text = errorText(error);
    if (text === undefined) throw error;
    if (api.isApiError(error, "property_conflict") || invalidTimeField(error)) {
      await loadProperties(false);
    }
    formError.value = text;
  } finally {
    saving.value = false;
  }
}

function saveDatabase(): Promise<NotionDatabase> {
  const settings = {
    projectMode: projectMode.value,
    projectPropertyId: takesProperty.value ? projectPropertyId.value : undefined,
    blockPosition: blockPosition.value,
    ...(timeFieldsChanged.value && { timeFields: timeFields.value }),
    ...(statuses.value.length > 0 && { skippedStatusIds: skippedStatusIds.value }),
  };
  return props.database === undefined
    ? api.addNotionDatabase({ dataSourceId: dataSourceId.value, ...settings })
    : api.updateNotionDatabase(props.database.id, settings);
}

function errorText(error: unknown): string | undefined {
  if (api.isApiError(error, "database_already_added")) {
    return t("notionDatabases.error.alreadyAdded");
  }
  if (api.isApiError(error, "property_conflict")) {
    const name = error.propertyName ?? "";
    const timeConflict = Object.values(timeFields.value).some(
      (choice) => choice.mode === "create" && choice.name.trim() === name,
    );
    return t(
      timeConflict
        ? "notionDatabases.error.timeFieldConflict"
        : "notionDatabases.error.propertyConflict",
      { name },
    );
  }
  if (api.isApiError(error, "validation_error") && error.fields.includes("timeFields")) {
    return t("notionDatabases.error.durationFormat");
  }
  if (invalidTimeField(error)) return t("notionDatabases.error.timeFieldSelection");
  return undefined;
}

function invalidTimeField(error: unknown): boolean {
  return (
    api.isApiError(error, "validation_error") &&
    error.fields.some((field) => field.startsWith("timeFields"))
  );
}
</script>

<template>
  <AppModal
    wide
    :title="t(isNew ? 'notionDatabases.add' : 'notionDatabases.settings')"
    :close-disabled="saving"
    @close="emit('close')"
  >
    <form :id="formId" class="flex flex-col gap-5" @submit.prevent="save">
      <div v-if="isNew" class="flex items-end gap-3">
        <AppField
          v-model="dataSourceId"
          kind="select"
          :label="t('notionDatabases.database')"
          class="min-w-0 flex-1"
        >
          <option
            v-for="source in notAdded"
            :key="source.dataSourceId"
            :value="source.dataSourceId"
          >
            {{ source.title }}
          </option>
        </AppField>
        <AppButton variant="ghost" @click="refreshAvailable">
          <RefreshCw :size="17" aria-hidden="true" />
          {{ t("notionDatabases.refresh") }}
        </AppButton>
      </div>
      <RadioChips
        v-model="projectMode"
        :legend="t('notionDatabases.projectMode')"
        :hint="t('notionDatabases.hint.projectMode')"
        :options="projectModeOptions"
      />
      <AppField
        v-if="takesProperty"
        v-model="projectPropertyId"
        kind="select"
        :label="t('notionDatabases.projectProperty')"
        :hint="t('notionDatabases.hint.projectProperty')"
      >
        <option v-for="property in properties" :key="property.id" :value="property.id">
          {{ property.name }}
        </option>
      </AppField>
      <NotionStatusChoice
        v-if="statuses.length > 0"
        v-model="skippedStatusIds"
        :statuses="statuses"
      />
      <RadioChips
        v-model="blockPosition"
        :legend="t('notionDatabases.blockPosition')"
        :hint="t('notionDatabases.hint.blockPosition')"
        :options="blockPositionOptions"
      />
      <NotionTimeFields
        v-model="timeFields"
        v-model:duration-enabled="durationEnabled"
        :columns="columns ?? []"
        :errors="timeFieldErrors"
        :disabled="dataSourceId === '' || saving"
      />
      <AppFormError v-if="columnsFailed && hasTimeFields" placement="form">
        {{ t("notionDatabases.error.timeFieldColumns") }}
      </AppFormError>
      <AppFormError v-if="formError" placement="form">{{ formError }}</AppFormError>
    </form>
    <template #actions>
      <AppButton type="submit" :form="formId" width="full-on-mobile" :disabled="!canSave">
        {{ t(isNew ? "notionDatabases.submit" : "form.save") }}
      </AppButton>
    </template>
    <template v-if="isNew" #note>{{ t("notionDatabases.addNote") }}</template>
  </AppModal>
</template>
