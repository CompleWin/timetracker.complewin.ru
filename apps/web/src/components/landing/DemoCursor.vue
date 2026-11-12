<script setup lang="ts">
import { MousePointer2 } from "@lucide/vue";

defineProps<{ point: { x: number; y: number }; shown: boolean; pressed: boolean; name: string }>();
</script>

<template>
  <div
    class="pointer-events-none absolute top-0 left-0 z-[60] [transition:transform_700ms_cubic-bezier(0.45,0.05,0.25,1),opacity_400ms]"
    :class="shown ? 'opacity-100' : 'opacity-0'"
    :style="{ transform: `translate(${point.x}px, ${point.y}px)` }"
  >
    <div
      class="relative origin-top-left transition-transform duration-[120ms]"
      :class="{ 'scale-[0.82]': pressed }"
    >
      <MousePointer2 :size="24" :stroke-width="1.5" class="-mt-1 -ml-1 block fill-fg text-white" />
      <span
        class="absolute top-[18px] left-4 inline-flex h-6 items-center rounded-full bg-fg px-2.5 text-meta font-semibold whitespace-nowrap text-white"
      >
        {{ name }}
      </span>
    </div>
  </div>
</template>
