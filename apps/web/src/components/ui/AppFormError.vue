<script setup lang="ts">
type FormErrorPlacement = "field" | "form";

withDefaults(defineProps<{ placement?: FormErrorPlacement }>(), { placement: "field" });

const placementClasses: Record<FormErrorPlacement, string> = {
  field: "mt-2 text-meta text-danger-ink",
  form: "rounded-field border border-danger bg-danger-soft px-4 py-3 text-small text-danger-ink",
};
</script>

<template>
  <p role="alert" :class="placementClasses[placement]">
    <slot />
  </p>
</template>
