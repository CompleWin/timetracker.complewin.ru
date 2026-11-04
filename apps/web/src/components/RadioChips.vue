<script setup lang="ts" generic="Value extends string">
import { useId } from "vue";
import AppChip from "./ui/AppChip.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";
import AppTooltip from "./ui/AppTooltip.vue";

defineProps<{ legend: string; hint?: string; options: { value: Value; label: string }[] }>();

const model = defineModel<Value>({ required: true });
const groupName = useId();
const legendId = useId();
</script>

<template>
  <fieldset :aria-labelledby="legendId">
    <legend class="relative mb-2 flex items-center gap-2">
      <AppSectionLabel :id="legendId">{{ legend }}</AppSectionLabel>
      <AppTooltip v-if="hint !== undefined" :subject="legend" :text="hint" />
    </legend>
    <div class="flex flex-wrap gap-2">
      <AppChip
        v-for="option in options"
        :key="option.value"
        as="label"
        size="sm"
        :active="model === option.value"
      >
        <input
          v-model="model"
          type="radio"
          class="sr-only"
          :name="groupName"
          :value="option.value"
        />
        {{ option.label }}
      </AppChip>
    </div>
  </fieldset>
</template>
