<script setup lang="ts">
import { Play, Square } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "./ui/AppButton.vue";

const props = withDefaults(
  defineProps<{ title: string; running: boolean; prominent?: boolean }>(),
  {
    prominent: false,
  },
);
const emit = defineEmits<{ start: []; stop: [] }>();

const { t } = useI18n();

const size = computed(() => (props.prominent ? "md" : "sm"));
</script>

<template>
  <AppButton
    v-if="running"
    variant="outline-black"
    :size
    :aria-label="t('timers.stopTask', { title })"
    @click="emit('stop')"
  >
    <Square :size="17" aria-hidden="true" />
    {{ t("timers.stop") }}
  </AppButton>
  <AppButton
    v-else
    :variant="prominent ? 'solid-primary' : 'outline-primary'"
    :size
    :aria-label="t('timers.startTask', { title })"
    @click="emit('start')"
  >
    <Play :size="17" aria-hidden="true" />
    {{ t("timers.start") }}
  </AppButton>
</template>
