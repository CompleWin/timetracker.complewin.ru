<script setup lang="ts">
import type { LucideIcon } from "@lucide/vue";

defineProps<{ icon: LucideIcon }>();
</script>

<template>
  <div
    role="status"
    class="flex items-center gap-2 bg-surface-inverse px-4 py-3 text-small text-fg-inverse md:px-8"
  >
    <component :is="icon" :size="15" aria-hidden="true" class="flex-none" />
    <span><slot /></span>
  </div>
</template>
