<script setup lang="ts">
import {
  notionBlockPositions,
  notionProjectModes,
  type AvailableNotionDatabase,
  type NotionBlockPosition,
  type NotionDatabase,
  type NotionProjectMode,
  type NotionProperty,
  type NotionStatus,
} from "@stt/shared";
import { RefreshCw } from "@lucide/vue";
import { computed, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import NotionStatusChoice from "./NotionStatusChoice.vue";
import RadioChips from "./RadioChips.vue";
import AppButton from "./ui/AppButton.vue";
import AppCheckbox from "./ui/AppCheckbox.vue";
import AppField from "./ui/AppField.vue";
import AppFormError from "./ui/AppFormError.vue";
import AppModal from "./ui/AppModal.vue";

const props = defineProps<{ database?: NotionDatabase; hasDefault: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const formId = useId();
const available = ref<AvailableNotionDatabase[]>([]);
const dataSourceId = ref(props.database?.dataSourceId ?? "");
const projectMode = ref<NotionProjectMode>(props.database?.projectMode ?? "own");
const properties = ref<NotionProperty[]>([]);
const projectPropertyId = ref(props.database?.projectProperty?.id ?? "");
const statuses = ref<NotionStatus[]>([]);
const skippedStatusIds = ref(props.database?.skippedStatusIds ?? []);
const blockPosition = ref<NotionBlockPosition>(props.database?.blockPosition ?? "start");
const timeProperties = ref(props.database?.timeProperties ?? false);
const isDefault = ref(props.database?.isDefault ?? !props.hasDefault);
const formError = ref<string>();
const saving = ref(false);

const isNew = computed(() => props.database === undefined);
const notAdded = computed(() => available.value.filter((source) => source.addedId === null));
const takesProperty = computed(() => projectMode.value === "property");
const keepsTimeProperties = computed(
  () => props.database?.timeProperties === true && !timeProperties.value,
);
const canSave = computed(
  () =>
    dataSourceId.value !== "" &&
    (!takesProperty.value || projectPropertyId.value !== "") &&
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
const timePropertyNames = computed(() => ({
  spentHours: t("notion.property.spentHours"),
  spent: t("notion.property.spent"),
  running: t("notion.property.running"),
  lastTracked: t("notion.property.lastTracked"),
}));

onMounted(async () => {
  if (isNew.value) await refreshAvailable();
});

watch(dataSourceId, loadProperties, { immediate: true });

watch(projectMode, chooseProjectProperty);

watch([dataSourceId, projectMode, projectPropertyId, timeProperties], () => {
  formError.value = undefined;
});

async function refreshAvailable(): Promise<void> {
  available.value = await api.fetchAvailableNotionDatabases();
  if (!notAdded.value.some((source) => source.dataSourceId === dataSourceId.value)) {
    dataSourceId.value = notAdded.value[0]?.dataSourceId ?? "";
  }
}

async function loadProperties(): Promise<void> {
  const source = dataSourceId.value;
  properties.value = [];
  statuses.value = [];
  if (source === "") return;
  const loaded = await api.fetchNotionDatabaseProperties(source).catch(() => undefined);
  if (loaded === undefined || source !== dataSourceId.value) return;
  properties.value = loaded.properties;
  statuses.value = loaded.statuses;
  if (isNew.value) skippedStatusIds.value = completeStatusIds(loaded.statuses);
  chooseProjectProperty();
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
  saving.value = true;
  try {
    await saveDatabase();
    emit("saved");
  } catch (error) {
    const text = errorText(error);
    if (text === undefined) throw error;
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
    timeProperties: timeProperties.value,
    isDefault: isDefault.value,
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
    return t("notionDatabases.error.propertyConflict", { name: error.propertyName ?? "" });
  }
  return undefined;
}
</script>

<template>
  <AppModal
    wide
    :title="t(isNew ? 'notionDatabases.add' : 'notionDatabases.settings')"
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
      <div class="flex flex-col gap-1">
        <AppCheckbox
          v-model="timeProperties"
          :label="t('notionDatabases.timeProperties')"
          :hint="t('notionDatabases.hint.timeProperties')"
        />
        <p class="pl-7 text-meta text-fg-subtle">
          {{ t("notionDatabases.timePropertiesNote", timePropertyNames) }}
        </p>
        <p v-if="keepsTimeProperties" class="pl-7 text-meta text-fg-subtle">
          {{ t("notionDatabases.timePropertiesKept") }}
        </p>
      </div>
      <AppCheckbox
        v-model="isDefault"
        :label="t('notionDatabases.isDefault')"
        :hint="t('notionDatabases.hint.isDefault')"
      />
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
