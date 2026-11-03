<script setup lang="ts" generic="Value extends string">
import { useId } from "vue";
import AppChip from "./ui/AppChip.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";

defineProps<{ legend: string; options: { value: Value; label: string }[] }>();

const model = defineModel<Value>({ required: true });
const groupName = useId();
</script>

<template>
  <fieldset>
    <AppSectionLabel as="legend" class="mb-2">{{ legend }}</AppSectionLabel>
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
