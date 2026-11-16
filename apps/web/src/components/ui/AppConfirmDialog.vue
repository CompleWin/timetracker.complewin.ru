<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppButton from "./AppButton.vue";
import AppModal from "./AppModal.vue";

defineProps<{
  title: string;
  confirmLabel: string;
  busy?: boolean;
  confirmDisabled?: boolean;
}>();
const emit = defineEmits<{ confirm: []; close: [] }>();

const { t } = useI18n();
</script>

<template>
  <AppModal :title :close-disabled="busy" @close="emit('close')">
    <p v-if="$slots.default" class="text-body text-fg-muted"><slot /></p>
    <template #actions>
      <AppButton
        variant="outline-gray"
        width="full-on-mobile"
        autofocus
        :disabled="busy"
        @click="emit('close')"
      >
        {{ t("dialog.cancel") }}
      </AppButton>
      <AppButton
        variant="solid-danger"
        width="full-on-mobile"
        :disabled="busy || confirmDisabled"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </AppButton>
    </template>
  </AppModal>
</template>
