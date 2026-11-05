<script setup lang="ts">
import { X } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import AppIconButton from "./AppIconButton.vue";

type FormErrorPlacement = "field" | "form";

withDefaults(defineProps<{ placement?: FormErrorPlacement; dismissible?: boolean }>(), {
  placement: "field",
  dismissible: false,
});
const emit = defineEmits<{ dismiss: [] }>();

const { t } = useI18n();

const BANNER = "rounded-field border border-danger bg-danger-soft text-small text-danger-ink";

const placementClasses: Record<FormErrorPlacement, string> = {
  field: "mt-2 text-meta text-danger-ink",
  form: `${BANNER} px-4 py-3`,
};

const DISMISSIBLE_BANNER = `${BANNER} flex items-center gap-2 py-1.5 pr-1.5 pl-4`;
</script>

<template>
  <p v-if="dismissible" role="alert" :class="DISMISSIBLE_BANNER">
    <span class="min-w-0 flex-1"><slot /></span>
    <AppIconButton size="sm" :label="t('actions.hide')" @click="emit('dismiss')">
      <X :size="17" aria-hidden="true" />
    </AppIconButton>
  </p>
  <p v-else role="alert" :class="placementClasses[placement]">
    <slot />
  </p>
</template>
