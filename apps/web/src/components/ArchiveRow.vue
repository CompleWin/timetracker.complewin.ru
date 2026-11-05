<script setup lang="ts">
import { ArchiveRestore } from "@lucide/vue";
import { formatDuration, type ProjectColor } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import AppButton from "./ui/AppButton.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

export type MarkerPlace = "name" | "meta";

const props = defineProps<{
  name: string;
  totalSec: number;
  meta: string;
  color: ProjectColor | null;
  markerAt: MarkerPlace;
}>();
const emit = defineEmits<{ restore: [] }>();

const { t } = useI18n();

const total = computed(() => formatDuration(props.totalSec, currentLocale()));
</script>

<template>
  <li class="flex min-h-[62px] flex-wrap items-center gap-x-5 gap-y-2 border-t border-line py-3">
    <div class="min-w-0 flex-[1_1_260px]">
      <div class="flex items-center gap-2.5">
        <ProjectMarker v-if="markerAt === 'name' && color !== null" :color />
        <span class="min-w-0 text-body font-semibold break-words">{{ name }}</span>
        <span class="font-code text-meta whitespace-nowrap text-fg-subtle">{{ total }}</span>
      </div>
      <p
        class="mt-0.5 flex items-center gap-1.5 text-meta text-fg-subtle"
        :class="{ 'pl-5': markerAt === 'name' }"
      >
        <ProjectMarker v-if="markerAt === 'meta' && color !== null" :color :size="8" />
        <span class="min-w-0 break-words">{{ meta }}</span>
      </p>
    </div>
    <AppButton
      variant="outline-primary"
      size="sm"
      :aria-label="t('archive.restoreItem', { name })"
      @click="emit('restore')"
    >
      <ArchiveRestore :size="17" aria-hidden="true" />
      {{ t("archive.restore") }}
    </AppButton>
  </li>
</template>
