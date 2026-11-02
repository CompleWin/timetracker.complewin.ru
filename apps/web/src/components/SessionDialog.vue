<script setup lang="ts">
import { SESSION_NOTE_MAX_LENGTH, type MessageKey, type Session } from "@stt/shared";
import { computed, reactive, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
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

const props = defineProps<{ taskId: string; session?: Session; timeZone: string | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const formId = useId();
const form = reactive(sessionForm(props.session, props.timeZone));
const errors = ref<SessionFormErrors>({});
const saving = ref(false);
const confirmingDelete = ref(false);

const isRunning = props.session?.endedAt === null;

const canSave = computed(
  () => form.start !== "" && (form.end !== "" || isRunning) && !saving.value,
);

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
  if (endedAt !== null) await api.createSession(props.taskId, { ...edited, endedAt });
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
      />
      <AppField
        v-model="form.note"
        kind="textarea"
        :label="t('sessions.note')"
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
