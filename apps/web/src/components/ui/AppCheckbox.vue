<script setup lang="ts">
import { Check, Minus } from "@lucide/vue";
import AppTooltip from "./AppTooltip.vue";

withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    labelHidden?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
  }>(),
  { hint: undefined, labelHidden: false, indeterminate: false, disabled: false },
);

const checked = defineModel<boolean>({ required: true });
</script>

<template>
  <div class="relative flex items-center gap-2">
    <label
      class="inline-flex items-center gap-2.5 text-body text-fg"
      :class="disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
    >
      <span class="relative inline-flex size-[18px] flex-none">
        <input
          v-model="checked"
          type="checkbox"
          :aria-label="labelHidden ? label : undefined"
          :indeterminate
          :disabled
          class="peer size-full cursor-pointer appearance-none rounded-[6px] border border-line-strong transition-colors duration-150 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
        />
        <Check
          :size="12"
          :stroke-width="3"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100"
        />
        <Minus
          :size="12"
          :stroke-width="3"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-indeterminate:opacity-100"
        />
      </span>
      <template v-if="!labelHidden">{{ label }}</template>
    </label>
    <AppTooltip v-if="hint !== undefined" :subject="label" :text="hint" />
  </div>
</template>
