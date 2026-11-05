<script setup lang="ts">
import { Check, PenLine } from "@lucide/vue";
import { SESSION_NOTE_MAX_LENGTH } from "@stt/shared";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNoteAutosave } from "../note-autosave.ts";

const props = defineProps<{ sessionId: string; note: string; title: string }>();

const { t } = useI18n();
const editing = ref(false);
const field = useTemplateRef("field");
const opener = useTemplateRef("opener");
const { note, saved, flush, sync } = useNoteAutosave(props.sessionId, props.note);

const firstLine = computed(() => note.value.split("\n")[0] ?? "");

watch(() => props.note, sync);

async function open(): Promise<void> {
  editing.value = true;
  await nextTick();
  field.value?.focus();
}

async function close(returnFocus: boolean): Promise<void> {
  if (!editing.value) return;
  editing.value = false;
  flush();
  if (!returnFocus) return;
  await nextTick();
  opener.value?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  const closesField = event.key === "Escape" || (event.key === "Enter" && !event.shiftKey);
  if (!closesField) return;
  event.preventDefault();
  event.stopPropagation();
  void close(true);
}
</script>

<template>
  <span v-if="editing" class="flex min-w-48 flex-1 items-center gap-2">
    <textarea
      ref="field"
      v-model="note"
      rows="1"
      :aria-label="t('timers.note', { title })"
      :placeholder="t('timers.notePlaceholder')"
      :maxlength="SESSION_NOTE_MAX_LENGTH"
      class="field-sizing-content min-w-0 flex-1 resize-none border-0 border-b border-primary bg-transparent text-input text-fg outline-none placeholder:text-fg-faint md:text-meta"
      @keydown="onKeydown"
      @blur="close(false)"
    />
    <span v-if="saved" class="inline-flex flex-none items-center gap-1 text-meta text-fg-subtle">
      <Check :size="15" aria-hidden="true" />
      {{ t("timers.noteSaved") }}
    </span>
  </span>
  <button
    v-else
    ref="opener"
    type="button"
    :aria-label="t('timers.writeNote', { title })"
    class="inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-full text-meta transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    @click="open"
  >
    <PenLine :size="15" aria-hidden="true" class="flex-none" />
    <span class="truncate" :class="firstLine === '' ? 'text-fg-faint' : 'text-fg-muted'">{{
      firstLine === "" ? t("sessions.note") : firstLine
    }}</span>
  </button>
</template>
