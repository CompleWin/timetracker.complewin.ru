import type { ActiveSession } from "@stt/shared";
import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import * as api from "./api.ts";

const SAVE_DELAY_MS = 1000;

export type NoteAutosave = {
  note: Ref<string>;
  saved: Ref<boolean>;
};

export function useNoteAutosave(session: ActiveSession): NoteAutosave {
  const note = ref(session.note);
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
    await api.updateSession(session.id, { note: text });
    saved.value = note.value === text;
  }

  return { note, saved };
}
