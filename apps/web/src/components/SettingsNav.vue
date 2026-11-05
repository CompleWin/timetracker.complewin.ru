<script setup lang="ts">
import { useI18n } from "vue-i18n";

export type SettingsSection = {
  id: string;
  title: string;
};

defineProps<{ sections: SettingsSection[]; current: string | undefined }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();
</script>

<template>
  <nav
    :aria-label="t('settings.sections')"
    class="sticky top-4 hidden w-[200px] flex-none flex-col gap-0.5 self-start md:flex"
  >
    <a
      v-for="section in sections"
      :key="section.id"
      :href="`#${section.id}`"
      :aria-current="section.id === current ? 'true' : undefined"
      class="flex min-h-10 items-center rounded-full px-3.5 text-body no-underline transition-colors duration-150"
      :class="
        section.id === current
          ? 'bg-surface-island font-semibold text-fg'
          : 'text-fg-subtle hover:bg-surface-active hover:text-fg'
      "
      @click.prevent="emit('select', section.id)"
    >
      {{ section.title }}
    </a>
  </nav>
</template>
