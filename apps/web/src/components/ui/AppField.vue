<script setup lang="ts">
import { Search } from "@lucide/vue";
import { computed, useId } from "vue";
import AppFormError from "./AppFormError.vue";
import AppSectionLabel from "./AppSectionLabel.vue";

type FieldKind = "text" | "search" | "select" | "datetime-local" | "textarea";

const props = withDefaults(
  defineProps<{ label: string; kind?: FieldKind; error?: string; maxlength?: number }>(),
  { kind: "text", error: undefined, maxlength: undefined },
);

const model = defineModel<string>({ required: true });
const fieldId = useId();
const errorId = useId();

const CONTROL =
  "w-full border text-input text-fg transition-colors duration-150 placeholder:text-fg-faint";

const SINGLE_LINE = "h-[46px]";

const CALM = "border-line-strong bg-transparent focus:border-primary";

const INVALID = "border-danger bg-danger-soft";

const state = computed(() => (props.error === undefined ? CALM : INVALID));
const invalid = computed(() => (props.error === undefined ? undefined : true));
const describedBy = computed(() => (props.error === undefined ? undefined : errorId));
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-2 flex items-center justify-between gap-3">
      <AppSectionLabel as="label" :for="fieldId">{{ label }}</AppSectionLabel>
      <slot name="status" />
    </div>
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
        :class="[CONTROL, SINGLE_LINE, CALM]"
        class="rounded-full pr-4 pl-11"
      />
    </div>
    <select
      v-else-if="kind === 'select'"
      :id="fieldId"
      v-model="model"
      :class="[CONTROL, SINGLE_LINE, CALM]"
      class="rounded-field px-4"
    >
      <slot />
    </select>
    <textarea
      v-else-if="kind === 'textarea'"
      :id="fieldId"
      v-model="model"
      :maxlength
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      :class="[CONTROL, state]"
      class="field-sizing-content min-h-24 resize-none rounded-field px-4 py-3"
    />
    <input
      v-else
      :id="fieldId"
      v-model="model"
      :type="kind"
      :maxlength
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      :class="[CONTROL, SINGLE_LINE, state]"
      class="min-w-0 rounded-field px-4"
    />
    <AppFormError v-if="error !== undefined" :id="errorId">{{ error }}</AppFormError>
  </div>
</template>
