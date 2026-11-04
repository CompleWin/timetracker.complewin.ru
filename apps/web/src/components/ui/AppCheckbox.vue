<script setup lang="ts">
import { Check } from "@lucide/vue";
import AppTooltip from "./AppTooltip.vue";

defineProps<{ label: string; hint?: string }>();

const checked = defineModel<boolean>({ required: true });
</script>

<template>
  <div class="relative flex items-center gap-2">
    <label class="inline-flex cursor-pointer items-center gap-2.5 text-body text-fg">
      <span class="relative inline-flex size-[18px] flex-none">
        <input
          v-model="checked"
          type="checkbox"
          class="peer size-full cursor-pointer appearance-none rounded-[6px] border border-line-strong transition-colors duration-150 checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <Check
          :size="12"
          :stroke-width="3"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      {{ label }}
    </label>
    <AppTooltip v-if="hint !== undefined" :subject="label" :text="hint" />
  </div>
</template>
