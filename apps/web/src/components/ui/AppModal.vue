<script setup lang="ts">
import { X } from "@lucide/vue";
import { onBeforeUnmount, onMounted, useId, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import AppIconButton from "./AppIconButton.vue";

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const titleId = useId();
const dialog = useTemplateRef("dialog");
let opener: HTMLElement | null = null;

onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
  dialog.value?.querySelector<HTMLElement>("input, select, textarea")?.focus();
});

onBeforeUnmount(() => {
  dialog.value?.close();
  opener?.focus();
});
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="m-auto w-[460px] max-w-[calc(100vw-32px)] rounded-island border border-line bg-surface-island p-[18px] text-fg shadow-modal backdrop:bg-overlay md:p-7"
    @cancel.prevent="emit('close')"
  >
    <div class="mb-5 flex items-start justify-between gap-4">
      <h2 :id="titleId" class="text-h3">{{ title }}</h2>
      <AppIconButton :label="t('dialog.close')" size="sm" @click="emit('close')">
        <X :size="17" aria-hidden="true" />
      </AppIconButton>
    </div>
    <slot />
    <div
      v-if="$slots.actions"
      class="mt-6 flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-end"
    >
      <slot name="actions" />
    </div>
  </dialog>
</template>
