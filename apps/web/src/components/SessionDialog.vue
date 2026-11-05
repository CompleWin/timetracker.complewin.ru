<script setup lang="ts">
import { ArrowUpRight } from "@lucide/vue";
import {
  SESSION_NOTE_MAX_LENGTH,
  toDateTimeLocal,
  type MessageKey,
  type Project,
  type Session,
} from "@stt/shared";
import { computed, reactive, ref, useId } from "vue";
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
import AppButton from "./ui/AppButton.vue";
import AppConfirmDialog from "./ui/AppConfirmDialog.vue";
import AppField from "./ui/AppField.vue";
import AppFormError from "./ui/AppFormError.vue";
import AppModal from "./ui/AppModal.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

export type SessionTask = { id: string; title: string; project: Project | null };

export type TaskChoice = { id: string; label: string };

export type SessionRange = { startedAt: string; endedAt: string };

const NO_TASK = "";

const props = withDefaults(
  defineProps<{
    timeZone: string | null;
    session?: Session;
    task?: SessionTask;
    choices?: TaskChoice[];
    chosenTaskId?: string | null;
    range?: SessionRange;
    linkToTask?: boolean;
  }>(),
  {
    session: undefined,
    task: undefined,
    choices: undefined,
    chosenTaskId: null,
    range: undefined,
    linkToTask: false,
  },
);
const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const formId = useId();
const form = reactive(initialForm());
const chosenTask = ref(props.chosenTaskId ?? NO_TASK);
const errors = ref<SessionFormErrors>({});
const saving = ref(false);
const confirmingDelete = ref(false);

const isRunning = props.session?.endedAt === null;

const targetTaskId = computed(() =>
  props.choices === undefined ? (props.task?.id ?? NO_TASK) : chosenTask.value,
);

const canSave = computed(
  () =>
    form.start !== "" &&
    (form.end !== "" || isRunning) &&
    targetTaskId.value !== NO_TASK &&
    !saving.value,
);

const endNote = computed(() =>
  isRunning && form.end === "" ? t("sessions.runningEndHint") : undefined,
);

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
  if (endedAt !== null) await api.createSession(targetTaskId.value, { ...edited, endedAt });
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
  <AppModal :title="t(session ? 'sessions.edit' : 'sessions.new')" @close="emit('close')">
    <form :id="formId" class="flex flex-col gap-5" @submit.prevent="save">
      <AppField
        v-if="choices !== undefined"
        v-model="chosenTask"
        kind="select"
        :label="t('sessions.task')"
      >
        <option :value="NO_TASK" disabled hidden></option>
        <option v-for="choice in choices" :key="choice.id" :value="choice.id">
          {{ choice.label }}
        </option>
      </AppField>
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
