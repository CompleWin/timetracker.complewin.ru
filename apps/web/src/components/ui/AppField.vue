<script setup lang="ts">
import { Search } from "@lucide/vue";
import { computed, useId, useTemplateRef } from "vue";
import AppFormError from "./AppFormError.vue";
import AppSectionLabel from "./AppSectionLabel.vue";
import AppTooltip from "./AppTooltip.vue";

type FieldKind = "text" | "search" | "select" | "datetime-local" | "textarea";

type TextareaRows = 1 | 3;

const props = withDefaults(
  defineProps<{
    label: string;
    kind?: FieldKind;
    error?: string;
    hint?: string;
    note?: string;
    placeholder?: string;
    maxlength?: number;
    rows?: TextareaRows;
  }>(),
  {
    kind: "text",
    error: undefined,
    hint: undefined,
    note: undefined,
    placeholder: undefined,
    maxlength: undefined,
    rows: 3,
  },
);

const model = defineModel<string>({ required: true });
const fieldId = useId();
const errorId = useId();
const noteId = useId();
const control = useTemplateRef<HTMLElement>("control");

const CONTROL =
  "w-full border text-input text-fg transition-colors duration-150 placeholder:text-fg-faint disabled:cursor-not-allowed disabled:opacity-50";

const SINGLE_LINE = "h-[46px]";

const CALM = "border-line-strong bg-transparent focus:border-primary";

const INVALID = "border-danger bg-danger-soft";

const textareaRowsClasses: Record<TextareaRows, string> = {
  1: "min-h-[46px] py-2.5",
  3: "min-h-24 py-3",
};

const state = computed(() => (props.error === undefined ? CALM : INVALID));
const invalid = computed(() => (props.error === undefined ? undefined : true));
const describedBy = computed(() => {
  const ids = [props.error === undefined ? "" : errorId, props.note === undefined ? "" : noteId];
  return ids.filter((id) => id !== "").join(" ") || undefined;
});

function focus(): void {
  control.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div class="flex flex-col">
    <div class="relative mb-2 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <AppSectionLabel as="label" :for="fieldId">{{ label }}</AppSectionLabel>
        <AppTooltip v-if="hint !== undefined" :subject="label" :text="hint" />
      </div>
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
        ref="control"
        v-model="model"
        type="search"
        :class="[CONTROL, SINGLE_LINE, CALM]"
        class="rounded-full pr-4 pl-11"
      />
    </div>
    <select
      v-else-if="kind === 'select'"
      :id="fieldId"
      ref="control"
      v-model="model"
      :class="[CONTROL, SINGLE_LINE, CALM]"
      class="rounded-field px-4"
    >
      <slot />
    </select>
    <textarea
      v-else-if="kind === 'textarea'"
      :id="fieldId"
      ref="control"
      v-model="model"
      :rows
      :maxlength
      :placeholder
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      :class="[CONTROL, state, textareaRowsClasses[rows]]"
      class="field-sizing-content resize-none rounded-field px-4"
    />
    <input
      v-else
      :id="fieldId"
      ref="control"
      v-model="model"
      :type="kind"
      :maxlength
      :placeholder
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      :class="[CONTROL, SINGLE_LINE, state]"
      class="min-w-0 rounded-field px-4"
    />
    <AppFormError v-if="error !== undefined" :id="errorId">{{ error }}</AppFormError>
    <p v-if="note !== undefined" :id="noteId" class="mt-2 text-meta text-fg-subtle">{{ note }}</p>
  </div>
</template>
