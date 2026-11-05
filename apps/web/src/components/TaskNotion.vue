<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import AppIsland from "./ui/AppIsland.vue";

defineProps<{ pageUrl: string }>();

const { t } = useI18n();
const titleId = useId();
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
  </AppIsland>
</template>
