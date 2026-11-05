<script setup lang="ts">
import type { ProjectColor } from "@stt/shared";
import { markerClass } from "../../project-colors.ts";

type MarkerSize = 8 | 10;

withDefaults(defineProps<{ color: ProjectColor; ringed?: boolean; size?: MarkerSize }>(), {
  ringed: false,
  size: 10,
});

const sizeClasses: Record<MarkerSize, string> = {
  8: "size-2",
  10: "size-2.5",
};
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-block flex-none rounded-full"
    :class="[sizeClasses[size], markerClass(color), ringed ? 'ring-2 ring-white' : '']"
  />
</template>
