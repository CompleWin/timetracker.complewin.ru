<script setup lang="ts">
import { PenLine } from "@lucide/vue";
import type { ActiveSession } from "@stt/shared";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useNoteAutosave } from "../note-autosave.ts";
import TimerButton from "./TimerButton.vue";
import TimerClock from "./TimerClock.vue";
import TimerNote from "./TimerNote.vue";
import AppIconButton from "./ui/AppIconButton.vue";

const props = defineProps<{ session: ActiveSession; now: number }>();
const emit = defineEmits<{ stop: [] }>();

const { t } = useI18n();
const noteOpen = ref(false);
const { note, saved } = useNoteAutosave(props.session);
</script>

<template>
  <li class="flex flex-col gap-3 border-b border-line py-3.5 last:border-0">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span class="min-w-0 flex-1 basis-full text-body font-semibold break-words md:basis-0">
        {{ session.task.title }}
      </span>
      <TimerClock :started-at="session.startedAt" :now class="text-title max-md:flex-1" />
      <div class="flex items-center gap-3">
        <AppIconButton
          :label="t('timers.writeNote', { title: session.task.title })"
          :pressed="noteOpen"
          :aria-expanded="noteOpen"
          @click="noteOpen = !noteOpen"
        >
          <PenLine :size="17" aria-hidden="true" />
        </AppIconButton>
        <TimerButton :title="session.task.title" running @stop="emit('stop')" />
      </div>
    </div>
    <TimerNote v-if="noteOpen" v-model="note" :title="session.task.title" :saved />
  </li>
</template>
