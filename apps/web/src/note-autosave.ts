import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import * as api from "./api.ts";

const SAVE_DELAY_MS = 1000;

export type NoteAutosave = {
  note: Ref<string>;
  saved: Ref<boolean>;
  flush: () => void;
  sync: (text: string) => void;
};

export function useNoteAutosave(sessionId: string, initialNote: string): NoteAutosave {
  const note = ref(initialNote);
  const saved = ref(false);
  let savedText = initialNote;
  let pendingSave: ReturnType<typeof setTimeout> | undefined;

  watch(note, (text) => {
    saved.value = false;
    clearTimeout(pendingSave);
    pendingSave = text === savedText ? undefined : setTimeout(save, SAVE_DELAY_MS);
  });

  onBeforeUnmount(flush);

  function flush(): void {
    if (pendingSave === undefined) return;
    clearTimeout(pendingSave);
    void save();
  }

  function sync(text: string): void {
    if (pendingSave !== undefined || text === savedText) return;
    savedText = text;
    note.value = text;
  }

  async function save(): Promise<void> {
    pendingSave = undefined;
    const text = note.value;
    savedText = text;
    await api.updateSession(sessionId, { note: text });
    saved.value = note.value === text;
  }

  return { note, saved, flush, sync };
}
