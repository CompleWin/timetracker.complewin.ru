<script setup lang="ts">
type BadgeTone = "accent" | "muted";

withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: "accent" });

const toneClasses: Record<BadgeTone, string> = {
  accent: "bg-primary-soft text-primary-ink",
  muted: "bg-surface-active text-fg-subtle",
};
</script>

<template>
  <span
    class="inline-flex h-[26px] items-center rounded-full px-3 text-badge whitespace-nowrap uppercase"
    :class="toneClasses[tone]"
  >
    <slot />
  </span>
</template>
