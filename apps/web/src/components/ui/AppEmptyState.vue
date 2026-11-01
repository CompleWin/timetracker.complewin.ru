<script setup lang="ts">
import AppIsland from "./AppIsland.vue";

defineProps<{ title: string }>();
</script>

<template>
  <AppIsland>
    <p class="max-w-[26ch] text-lead text-fg">{{ title }}</p>
  </AppIsland>
</template>
