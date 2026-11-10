<script setup lang="ts">
import { TASK_TITLE_MAX_LENGTH, type Project, type Task, type UpdateTaskBody } from "@stt/shared";
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { isOnline } from "../connection.ts";
import AppButton from "./ui/AppButton.vue";
import AppField from "./ui/AppField.vue";
import AppFormError from "./ui/AppFormError.vue";
import AppModal from "./ui/AppModal.vue";

type StartErrorKey = "tasks.startError.tooManyRunning" | "tasks.startError.failed";

const NO_PROJECT_OPTION = "";

const props = defineProps<{ projects: Project[]; task?: Task; projectId?: string }>();
const emit = defineEmits<{ close: []; saved: []; created: [] }>();

const { t } = useI18n();
const formId = useId();
const initialProjectOption = projectOptionOf(props.task?.projectId ?? props.projectId ?? null);
const title = ref(props.task?.title ?? "");
const projectOption = ref(initialProjectOption);
const saving = ref(false);
const startError = ref<StartErrorKey | null>(null);

const locked = computed(() => startError.value !== null);
const canSave = computed(
  () =>
    title.value.trim() !== "" &&
    !saving.value &&
    !locked.value &&
    (props.task !== undefined || isOnline.value),
);

function projectOptionOf(projectId: string | null): string {
  const listed = props.projects.some((project) => project.id === projectId);
  return listed && projectId !== null ? projectId : NO_PROJECT_OPTION;
}

function selectedProjectId(): string | null {
  return projectOption.value === NO_PROJECT_OPTION ? null : projectOption.value;
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await (props.task === undefined ? createAndStart() : update(props.task));
  } finally {
    saving.value = false;
  }
}

async function createAndStart(): Promise<void> {
  const task = await api.createTask({ title: title.value, projectId: selectedProjectId() });
  try {
    await api.startTimer(task.id);
    emit("saved");
  } catch (error) {
    startError.value = startErrorKey(error);
    emit("created");
  }
}

function startErrorKey(error: unknown): StartErrorKey {
  return api.isApiError(error, "too_many_running")
    ? "tasks.startError.tooManyRunning"
    : "tasks.startError.failed";
}

async function update(task: Task): Promise<void> {
  const fields = changedFields(task);
  if (Object.keys(fields).length > 0) await api.updateTask(task.id, fields);
  emit("saved");
}

function changedFields(task: Task): UpdateTaskBody {
  const fields: UpdateTaskBody = {};
  if (title.value !== task.title) fields.title = title.value;
  if (projectOption.value !== initialProjectOption) fields.projectId = selectedProjectId();
  return fields;
}
</script>

<template>
  <AppModal :title="t(task ? 'tasks.edit' : 'tasks.new')" @close="emit('close')">
    <form :id="formId" class="flex flex-col gap-5" @submit.prevent="save">
      <fieldset :disabled="locked" class="flex min-w-0 flex-col gap-5">
        <AppField v-model="title" :label="t('form.name')" :maxlength="TASK_TITLE_MAX_LENGTH" />
        <AppField v-model="projectOption" kind="select" :label="t('tasks.project')">
          <option :value="NO_PROJECT_OPTION">{{ t("home.noProject") }}</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </AppField>
      </fieldset>
      <AppFormError v-if="startError" placement="form">{{ t(startError) }}</AppFormError>
    </form>
    <template #actions>
      <AppButton type="submit" :form="formId" width="full-on-mobile" :disabled="!canSave">
        {{ t(task ? "form.save" : "form.create") }}
      </AppButton>
    </template>
  </AppModal>
</template>
