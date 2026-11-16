<script setup lang="ts">
import { ArrowUpRight } from "@lucide/vue";
import {
  SESSION_NOTE_MAX_LENGTH,
  toDateTimeLocal,
  type MessageKey,
  type Project,
  type Session,
  type Task,
} from "@stt/shared";
import { computed, nextTick, reactive, ref, useId, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import * as api from "../api.ts";
import {
  editedTime,
  endsAfterStart,
  sessionChanges,
  sessionForm,
  submitErrors,
  type EditedSession,
  type SessionFormErrors,
} from "../session-form.ts";
import TaskPicker from "./TaskPicker.vue";
import AppButton from "./ui/AppButton.vue";
import AppConfirmDialog from "./ui/AppConfirmDialog.vue";
import AppField from "./ui/AppField.vue";
import AppFormError from "./ui/AppFormError.vue";
import AppModal from "./ui/AppModal.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

export type SessionTask = { id: string; title: string; project: Project | null };

type TaskPickerData = { tasks: Task[]; projects: Project[]; todaySec: Map<string, number> };

export type SessionRange = { startedAt: string; endedAt: string };

const props = withDefaults(
  defineProps<{
    timeZone: string | null;
    session?: Session;
    task?: SessionTask;
    taskPicker?: TaskPickerData;
    chosenTaskId?: string | null;
    range?: SessionRange;
    linkToTask?: boolean;
  }>(),
  {
    session: undefined,
    task: undefined,
    taskPicker: undefined,
    chosenTaskId: null,
    range: undefined,
    linkToTask: false,
  },
);
const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const formId = useId();
const taskFieldId = useId();
const pickerId = useId();
const form = reactive(initialForm());
const chosenTaskId = ref(props.chosenTaskId);
const pickerOpen = ref(false);
const pickerField = useTemplateRef("pickerField");
const taskButton = useTemplateRef("taskButton");
const errors = ref<SessionFormErrors>({});
const saving = ref(false);
const confirmingDelete = ref(false);

const isRunning = props.session?.endedAt === null;

const chosenTask = computed(() =>
  props.taskPicker?.tasks.find((task) => task.id === chosenTaskId.value),
);
const targetTaskId = computed(() => props.task?.id ?? chosenTask.value?.id);
const taskLabel = computed(() => {
  const task = chosenTask.value;
  if (task === undefined) return t("sessions.chooseTask");
  const project = props.taskPicker?.projects.find((project) => project.id === task.projectId);
  return project === undefined
    ? task.title
    : t("sessions.taskOption", { title: task.title, project: project.name });
});

const canSave = computed(
  () =>
    form.start !== "" &&
    (form.end !== "" || isRunning) &&
    targetTaskId.value !== undefined &&
    !saving.value,
);

const endNote = computed(() =>
  isRunning && form.end === "" ? t("sessions.runningEndHint") : undefined,
);

async function closePicker(): Promise<void> {
  pickerOpen.value = false;
  await nextTick();
  taskButton.value?.focus();
}

function selectTask(task: Task): Promise<void> {
  chosenTaskId.value = task.id;
  return closePicker();
}

function closePickerOnEscape(event: KeyboardEvent): void {
  if (!pickerOpen.value || event.key !== "Escape" || event.defaultPrevented) return;
  event.preventDefault();
  void closePicker();
}

function closePickerOnOutsideClick(event: MouseEvent): void {
  if (
    pickerOpen.value &&
    event.target instanceof Node &&
    !pickerField.value?.contains(event.target)
  ) {
    pickerOpen.value = false;
  }
}

function initialForm() {
  const filled = sessionForm(props.session, props.timeZone);
  if (props.range === undefined) return filled;
  return {
    ...filled,
    start: toDateTimeLocal(props.range.startedAt, props.timeZone),
    end: toDateTimeLocal(props.range.endedAt, props.timeZone),
  };
}

async function save(): Promise<void> {
  if (!canSave.value) return;
  const edited = editedSession();
  if (!endsAfterStart(edited)) {
    errors.value = { endedAt: "sessions.error.endNotAfterStart" };
    return;
  }
  errors.value = {};
  saving.value = true;
  try {
    await submit(edited);
    emit("saved");
  } catch (error) {
    errors.value = submitErrors(error);
  } finally {
    saving.value = false;
  }
}

function editedSession(): EditedSession {
  const original = props.session;
  return {
    startedAt: editedTime(form.start, original?.startedAt ?? null, props.timeZone),
    endedAt:
      form.end === "" ? null : editedTime(form.end, original?.endedAt ?? null, props.timeZone),
    note: form.note,
  };
}

async function submit({ endedAt, ...edited }: EditedSession): Promise<void> {
  if (props.session !== undefined) return saveChanges(props.session, { ...edited, endedAt });
  const taskId = targetTaskId.value;
  if (endedAt !== null && taskId !== undefined) {
    await api.createSession(taskId, { ...edited, endedAt });
  }
}

async function saveChanges(session: Session, edited: EditedSession): Promise<void> {
  const changes = sessionChanges(session, edited);
  if (Object.keys(changes).length > 0) await api.updateSession(session.id, changes);
}

async function remove(): Promise<void> {
  if (props.session === undefined) return;
  await api.deleteSession(props.session.id);
  emit("saved");
}

function message(key: MessageKey | undefined): string | undefined {
  return key === undefined ? undefined : t(key);
}
</script>

<template>
  <AppConfirmDialog
    v-if="confirmingDelete"
    :title="t('sessions.deleteQuestion')"
    :confirm-label="t('sessions.delete')"
    @close="confirmingDelete = false"
    @confirm="remove"
  />
  <AppModal
    :title="t(session ? 'sessions.edit' : 'sessions.new')"
    @close="emit('close')"
    @click="closePickerOnOutsideClick"
    @keydown="closePickerOnEscape"
  >
    <form :id="formId" class="flex flex-col gap-5" @submit.prevent="save">
      <div v-if="taskPicker !== undefined" ref="pickerField" class="min-w-0">
        <AppSectionLabel as="label" :for="taskFieldId" class="mb-2">
          {{ t("sessions.task") }}
        </AppSectionLabel>
        <button
          :id="taskFieldId"
          ref="taskButton"
          type="button"
          autofocus
          :aria-label="t('sessions.taskField', { task: taskLabel })"
          :aria-expanded="pickerOpen"
          :aria-controls="pickerOpen ? pickerId : undefined"
          class="flex h-[46px] w-full cursor-pointer items-center rounded-field border border-line-strong px-4 text-left text-input transition-colors duration-150 focus:border-primary focus:outline-hidden"
          :class="chosenTask === undefined ? 'text-fg-subtle' : 'text-fg'"
          @click="pickerOpen = !pickerOpen"
        >
          <span class="min-w-0 truncate">{{ taskLabel }}</span>
        </button>
        <TaskPicker
          v-if="pickerOpen"
          :id="pickerId"
          :tasks="taskPicker.tasks"
          :projects="taskPicker.projects"
          :today-sec="taskPicker.todaySec"
          selection-only
          class="mt-2"
          @select="selectTask"
          @close="closePicker"
        />
      </div>
      <div v-else-if="session && task" class="flex min-h-9 items-center gap-2">
        <ProjectMarker v-if="task.project" :color="task.project.color" />
        <span class="min-w-0 flex-1 text-body font-semibold break-words">{{ task.title }}</span>
        <RouterLink
          v-if="linkToTask"
          :to="`/tasks/${task.id}`"
          class="inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full px-3 text-small text-fg-muted no-underline transition-colors duration-150 hover:bg-surface-page hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ t("sessions.toTask") }}
          <ArrowUpRight :size="15" aria-hidden="true" />
        </RouterLink>
      </div>
      <AppField
        v-model="form.start"
        kind="datetime-local"
        :label="t('sessions.start')"
        :error="message(errors.startedAt)"
      />
      <AppField
        v-model="form.end"
        kind="datetime-local"
        :label="t('sessions.end')"
        :error="message(errors.endedAt)"
        :note="endNote"
      />
      <AppField
        v-model="form.note"
        kind="textarea"
        :label="t('sessions.note')"
        :placeholder="t('sessions.notePlaceholder')"
        :maxlength="SESSION_NOTE_MAX_LENGTH"
      />
      <AppFormError v-if="errors.form" placement="form">{{ t(errors.form) }}</AppFormError>
    </form>
    <template #actions>
      <AppButton
        v-if="session"
        variant="ghost-danger"
        class="md:mr-auto"
        @click="confirmingDelete = true"
      >
        {{ t("sessions.delete") }}
      </AppButton>
      <AppButton type="submit" :form="formId" width="full-on-mobile" :disabled="!canSave">
        {{ t("form.save") }}
      </AppButton>
    </template>
  </AppModal>
</template>
