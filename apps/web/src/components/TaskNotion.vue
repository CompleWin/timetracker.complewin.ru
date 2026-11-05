<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import { notionBlockPositions, type NotionBlockPosition } from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import AppField from "./ui/AppField.vue";
import AppIsland from "./ui/AppIsland.vue";

const INHERIT = "inherit";

const props = defineProps<{ pageUrl: string; blockPosition: NotionBlockPosition | null }>();

const emit = defineEmits<{ changePosition: [position: NotionBlockPosition | null] }>();

const { t } = useI18n();
const titleId = useId();

const position = computed({
  get: () => props.blockPosition ?? INHERIT,
  set: (value: string) => emit("changePosition", toBlockPosition(value)),
});

function toBlockPosition(value: string): NotionBlockPosition | null {
  return notionBlockPositions.find((candidate) => candidate === value) ?? null;
}
</script>

<template>
  <AppIsland as="section" padding="none" :aria-labelledby="titleId" class="px-4 pt-4 pb-5 md:px-6">
    <h2 :id="titleId" class="text-title">{{ t("notion.title") }}</h2>
    <a
      :href="pageUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-2 -ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-body text-fg-muted no-underline transition-colors duration-150 hover:bg-surface-page hover:text-fg"
    >
      <ExternalLink :size="17" aria-hidden="true" />
      {{ t("tasks.openInNotion") }}
    </a>
    <AppField
      v-model="position"
      kind="select"
      :label="t('tasks.blockPosition')"
      :note="t('tasks.blockPosition.note')"
      class="mt-4"
    >
      <option :value="INHERIT">{{ t("tasks.blockPosition.inherit") }}</option>
      <option v-for="option in notionBlockPositions" :key="option" :value="option">
        {{ t(`tasks.blockPosition.${option}`) }}
      </option>
    </AppField>
  </AppIsland>
</template>
