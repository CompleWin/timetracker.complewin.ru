<script setup lang="ts">
type LabelTone = "default" | "inverse";

withDefaults(defineProps<{ as?: string; tone?: LabelTone }>(), { as: "span", tone: "default" });

const toneClasses: Record<LabelTone, string> = {
  default: "text-fg-faint",
  inverse: "text-white/70",
};
</script>

<template>
  <component :is="as" class="block text-caps uppercase" :class="toneClasses[tone]">
    <slot />
  </component>
</template>
