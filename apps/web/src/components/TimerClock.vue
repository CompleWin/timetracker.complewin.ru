<script setup lang="ts">
import { elapsedSec, formatClock } from "@stt/shared";
import { computed } from "vue";

const props = defineProps<{ startedAt: string; now: number }>();

const clock = computed(() => formatClock(elapsedSec(props.startedAt, props.now)));
</script>

<template>
  <span class="font-code text-primary">{{ clock }}</span>
</template>
