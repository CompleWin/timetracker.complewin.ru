<script setup lang="ts">
import { Check } from "@lucide/vue";
import { SESSION_NOTE_MAX_LENGTH } from "@stt/shared";
import { onMounted, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import AppField from "./ui/AppField.vue";

defineProps<{ title: string; saved: boolean }>();

const note = defineModel<string>({ required: true });

const { t } = useI18n();
const field = useTemplateRef("field");

onMounted(() => field.value?.focus());
</script>

<template>
  <AppField
    ref="field"
    v-model="note"
    kind="textarea"
    :rows="1"
    :label="t('timers.note', { title })"
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
