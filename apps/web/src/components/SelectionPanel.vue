<script lang="ts">
export const NO_MOVE_TARGET = "";
</script>

<script setup lang="ts">
import { Archive } from "@lucide/vue";
import type { Project } from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { isOnline } from "../connection.ts";
import AppButton from "./ui/AppButton.vue";

const NO_PROJECT_OPTION = "none";

const props = defineProps<{ count: number; projects: Project[]; busy: boolean }>();
const emit = defineEmits<{ move: [projectId: string | null]; archive: []; clear: [] }>();

const target = defineModel<string>("target", { required: true });

const { t } = useI18n();
const targetId = useId();

const canChange = computed(() => !props.busy && isOnline.value);

function move(): void {
  emit("move", target.value === NO_PROJECT_OPTION ? null : target.value);
}
</script>

<template>
  <div
    role="region"
    :aria-label="t('tasksPage.selection')"
    class="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface-island px-4 py-3 shadow-popover"
  >
    <span class="text-small font-semibold">{{ t("tasksPage.selectedCount", { count }) }}</span>
    <div class="flex min-w-0 items-center gap-2 max-md:w-full">
      <label :for="targetId" class="flex-none text-small text-fg-muted">
        {{ t("tasksPage.moveTo") }}
      </label>
      <select
        :id="targetId"
        v-model="target"
        :disabled="busy"
        class="min-w-0 cursor-pointer border-b border-primary bg-transparent py-1 text-input text-fg disabled:cursor-not-allowed disabled:opacity-50 max-md:flex-1"
      >
        <option :value="NO_MOVE_TARGET">{{ t("tasksPage.chooseProject") }}</option>
        <option :value="NO_PROJECT_OPTION">{{ t("home.noProject") }}</option>
        <option v-for="project in projects" :key="project.id" :value="project.id">
          {{ project.name }}
        </option>
      </select>
    </div>
    <AppButton
      variant="outline-primary"
      size="sm"
      :disabled="!canChange || target === NO_MOVE_TARGET"
      @click="move"
    >
      {{ t("tasksPage.move") }}
    </AppButton>
    <AppButton variant="ghost-danger" size="sm" :disabled="!canChange" @click="emit('archive')">
      <Archive :size="15" aria-hidden="true" />
      {{ t("actions.archive") }}
    </AppButton>
    <AppButton variant="quiet" size="sm" class="ml-auto" :disabled="busy" @click="emit('clear')">
      {{ t("tasksPage.clearSelection") }}
    </AppButton>
  </div>
</template>
