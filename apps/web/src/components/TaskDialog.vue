<script setup lang="ts">
import { TASK_TITLE_MAX_LENGTH, type Project, type Task } from "@stt/shared";
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import AppButton from "./ui/AppButton.vue";
import AppField from "./ui/AppField.vue";
import AppModal from "./ui/AppModal.vue";

const NO_PROJECT_OPTION = "";

const props = defineProps<{ projects: Project[]; task?: Task; projectId?: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const formId = useId();
const title = ref(props.task?.title ?? "");
const projectOption = ref(props.task?.projectId ?? props.projectId ?? NO_PROJECT_OPTION);
const saving = ref(false);

const canSave = computed(() => title.value.trim() !== "" && !saving.value);

async function save(): Promise<void> {
  saving.value = true;
  try {
    await saveTask({ title: title.value, projectId: selectedProjectId() });
    emit("saved");
  } finally {
    saving.value = false;
  }
}

function selectedProjectId(): string | null {
  return projectOption.value === NO_PROJECT_OPTION ? null : projectOption.value;
}

function saveTask(fields: { title: string; projectId: string | null }): Promise<Task> {
  return props.task === undefined ? api.createTask(fields) : api.updateTask(props.task.id, fields);
}
</script>

<template>
  <AppModal :title="t(task ? 'tasks.edit' : 'tasks.new')" @close="emit('close')">
    <form :id="formId" class="flex flex-col gap-5" @submit.prevent="save">
      <AppField v-model="title" :label="t('form.name')" :maxlength="TASK_TITLE_MAX_LENGTH" />
      <AppField v-model="projectOption" kind="select" :label="t('tasks.project')">
        <option :value="NO_PROJECT_OPTION">{{ t("home.noProject") }}</option>
        <option v-for="project in projects" :key="project.id" :value="project.id">
          {{ project.name }}
        </option>
      </AppField>
    </form>
    <template #actions>
      <AppButton type="submit" :form="formId" width="full-on-mobile" :disabled="!canSave">
        {{ t(task ? "form.save" : "form.create") }}
      </AppButton>
    </template>
  </AppModal>
</template>
