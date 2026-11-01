<script setup lang="ts">
import { Play, Square } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import AppButton from "./ui/AppButton.vue";

defineProps<{ title: string; running: boolean }>();
const emit = defineEmits<{ start: []; stop: [] }>();

const { t } = useI18n();
</script>

<template>
  <AppButton
    v-if="running"
    variant="outline-black"
    size="sm"
    :aria-label="t('timers.stopTask', { title })"
    @click="emit('stop')"
  >
    <Square :size="17" aria-hidden="true" />
    {{ t("timers.stop") }}
  </AppButton>
  <AppButton
    v-else
    variant="outline-primary"
    size="sm"
    :aria-label="t('timers.startTask', { title })"
    @click="emit('start')"
  >
    <Play :size="17" aria-hidden="true" />
    {{ t("timers.start") }}
  </AppButton>
</template>
