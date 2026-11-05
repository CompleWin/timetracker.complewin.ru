<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <p class="max-w-[26ch] text-lead text-fg">{{ title }}</p>
</template>
