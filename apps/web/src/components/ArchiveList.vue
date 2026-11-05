<script setup lang="ts">
import { useId } from "vue";
import AppEmptyState from "./ui/AppEmptyState.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppSkeleton from "./ui/AppSkeleton.vue";

defineProps<{ title: string; count: number; loaded: boolean; empty: string }>();

const titleId = useId();
</script>

<template>
  <AppIsland as="section" padding="none" :aria-labelledby="titleId" class="px-4 pt-4 pb-2 md:px-6">
    <div class="flex items-baseline gap-2.5 pb-2">
      <h2 :id="titleId" class="text-title">{{ title }}</h2>
      <span v-if="loaded" class="text-meta text-fg-faint">{{ count }}</span>
    </div>
    <slot name="notice" />
    <AppSkeleton v-if="!loaded" class="pb-4" />
    <AppEmptyState v-else-if="count === 0" :title="empty" class="pb-4" />
    <ul v-else>
      <slot />
    </ul>
  </AppIsland>
</template>
