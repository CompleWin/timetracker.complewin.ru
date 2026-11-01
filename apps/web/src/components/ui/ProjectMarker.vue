<script setup lang="ts">
import type { ProjectColor } from "@stt/shared";

withDefaults(defineProps<{ color: ProjectColor; ringed?: boolean }>(), { ringed: false });

const fillClasses: Record<ProjectColor, string> = {
  default: "border border-line-strong",
  gray: "bg-project-gray",
  brown: "bg-project-brown",
  orange: "bg-project-orange",
  yellow: "bg-project-yellow",
  green: "bg-project-green",
  blue: "bg-project-blue",
  purple: "bg-project-purple",
  pink: "bg-project-pink",
  red: "bg-project-red",
};
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-block size-2.5 flex-none rounded-full"
    :class="[fillClasses[color], ringed ? 'ring-2 ring-white' : '']"
  />
</template>
