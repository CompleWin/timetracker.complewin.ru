<script setup lang="ts">
import { Check } from "@lucide/vue";
import { SESSION_NOTE_MAX_LENGTH, type ActiveSession } from "@stt/shared";
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import AppField from "./ui/AppField.vue";

const SAVE_DELAY_MS = 1000;

const props = defineProps<{ session: ActiveSession }>();

const { t } = useI18n();
const note = ref(props.session.note);
const saved = ref(false);
let pendingSave: ReturnType<typeof setTimeout> | undefined;

watch(note, () => {
  saved.value = false;
  clearTimeout(pendingSave);
  pendingSave = setTimeout(save, SAVE_DELAY_MS);
});

onBeforeUnmount(() => {
  if (pendingSave === undefined) return;
  clearTimeout(pendingSave);
  void save();
});

async function save(): Promise<void> {
  pendingSave = undefined;
  const text = note.value;
  await api.updateSession(props.session.id, { note: text });
  saved.value = note.value === text;
}
</script>

<template>
  <AppField
    v-model="note"
    kind="textarea"
    :label="t('timers.note', { title: session.task.title })"
    :maxlength="SESSION_NOTE_MAX_LENGTH"
  >
    <template #status>
      <span v-if="saved" class="inline-flex items-center gap-1 text-meta text-fg-subtle">
        <Check :size="15" aria-hidden="true" />
        {{ t("timers.noteSaved") }}
      </span>
    </template>
  </AppField>
</template>
