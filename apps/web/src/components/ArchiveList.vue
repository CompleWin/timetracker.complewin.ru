<script setup lang="ts" generic="Item extends { id: string }">
import { ArchiveRestore } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppSkeleton from "./ui/AppSkeleton.vue";

defineProps<{ title: string; items: Item[]; loaded: boolean; nameOf: (item: Item) => string }>();
const emit = defineEmits<{ restore: [item: Item] }>();

const { t } = useI18n();
</script>

<template>
  <AppIsland as="section">
    <h2 class="text-title">{{ title }}</h2>
    <slot name="notice" />
    <AppSkeleton v-if="!loaded" class="mt-4" />
    <ul v-else-if="items.length > 0" class="mt-2">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 border-b border-line py-3.5 last:border-0"
      >
        <slot name="marker" :item />
        <span class="min-w-0 flex-1 text-body break-words text-fg">{{ nameOf(item) }}</span>
        <AppButton
          variant="outline-primary"
          size="sm"
          :aria-label="t('archive.restoreItem', { name: nameOf(item) })"
          @click="emit('restore', item)"
        >
          <ArchiveRestore :size="17" aria-hidden="true" />
          {{ t("archive.restore") }}
        </AppButton>
      </li>
    </ul>
  </AppIsland>
</template>
