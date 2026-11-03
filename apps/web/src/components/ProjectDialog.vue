<script setup lang="ts">
import {
  PROJECT_NAME_MAX_LENGTH,
  type NotionDatabase,
  type Project,
  type ProjectColor,
} from "@stt/shared";
import { computed, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import ProjectColorField from "./ProjectColorField.vue";
import AppButton from "./ui/AppButton.vue";
import AppField from "./ui/AppField.vue";
import AppModal from "./ui/AppModal.vue";

type ProjectFields = {
  name: string;
  color: ProjectColor;
  notionDatabaseId: string | null;
};

const DEFAULT_DATABASE_OPTION = "";

const props = defineProps<{ project?: Project }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const formId = useId();
const name = ref(props.project?.name ?? "");
const color = ref<ProjectColor>(props.project?.color ?? "default");
const databaseOption = ref(props.project?.notionDatabaseId ?? DEFAULT_DATABASE_OPTION);
const databases = ref<NotionDatabase[]>([]);
const nameTaken = ref(false);
const saving = ref(false);

const canSave = computed(() => name.value.trim() !== "" && !saving.value);

watch(name, () => {
  nameTaken.value = false;
});

onMounted(async () => {
  const connection = await api.fetchNotionConnection();
  databases.value = connection?.databases ?? [];
});

async function save(): Promise<void> {
  saving.value = true;
  try {
    await saveProject({
      name: name.value,
      color: color.value,
      notionDatabaseId:
        databaseOption.value === DEFAULT_DATABASE_OPTION ? null : databaseOption.value,
    });
    emit("saved");
  } catch (error) {
    if (!api.isApiError(error, "name_taken")) throw error;
    nameTaken.value = true;
  } finally {
    saving.value = false;
  }
}

function saveProject(fields: ProjectFields): Promise<Project> {
  return props.project === undefined
    ? api.createProject(fields)
    : api.updateProject(props.project.id, fields);
}
</script>

<template>
  <AppModal :title="t(project ? 'projects.edit' : 'projects.new')" @close="emit('close')">
    <form :id="formId" class="flex flex-col gap-5" @submit.prevent="save">
      <AppField
        v-model="name"
        :label="t('form.name')"
        :maxlength="PROJECT_NAME_MAX_LENGTH"
        :error="nameTaken ? t('projects.nameTaken') : undefined"
      />
      <ProjectColorField v-model="color" />
      <AppField
        v-if="databases.length > 0"
        v-model="databaseOption"
        kind="select"
        :label="t('notionDatabases.database')"
      >
        <option :value="DEFAULT_DATABASE_OPTION">{{ t("projects.notionDatabaseDefault") }}</option>
        <option v-for="database in databases" :key="database.id" :value="database.id">
          {{ database.title }}
        </option>
      </AppField>
    </form>
    <template #actions>
      <AppButton type="submit" :form="formId" width="full-on-mobile" :disabled="!canSave">
        {{ t(project ? "form.save" : "form.create") }}
      </AppButton>
    </template>
  </AppModal>
</template>
