<script setup lang="ts">
import { Search } from "@lucide/vue";
import { useId } from "vue";
import AppFormError from "./AppFormError.vue";
import AppSectionLabel from "./AppSectionLabel.vue";

type FieldKind = "text" | "search" | "select";

withDefaults(
  defineProps<{ label: string; kind?: FieldKind; error?: string; maxlength?: number }>(),
  { kind: "text", error: undefined, maxlength: undefined },
);

const model = defineModel<string>({ required: true });
const fieldId = useId();
const errorId = useId();

const CONTROL =
  "h-[46px] w-full border text-input text-fg transition-colors duration-150 placeholder:text-fg-faint";

const CALM = "border-line-strong bg-transparent focus:border-primary";

const INVALID = "border-danger bg-danger-soft";
</script>

<template>
  <div class="flex flex-col">
    <AppSectionLabel as="label" :for="fieldId" class="mb-2">{{ label }}</AppSectionLabel>
    <div v-if="kind === 'search'" class="relative">
      <Search
        :size="17"
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 left-4 my-auto text-fg-faint"
      />
      <input
        :id="fieldId"
        v-model="model"
        type="search"
        :class="[CONTROL, CALM]"
        class="rounded-full pr-4 pl-11"
      />
    </div>
    <select
      v-else-if="kind === 'select'"
      :id="fieldId"
      v-model="model"
      :class="[CONTROL, CALM]"
      class="rounded-field px-4"
    >
      <slot />
    </select>
    <input
      v-else
      :id="fieldId"
      v-model="model"
      type="text"
      :maxlength
      :aria-invalid="error === undefined ? undefined : true"
      :aria-describedby="error === undefined ? undefined : errorId"
      :class="[CONTROL, error === undefined ? CALM : INVALID]"
      class="rounded-field px-4"
    />
    <AppFormError v-if="error !== undefined" :id="errorId">{{ error }}</AppFormError>
  </div>
</template>
