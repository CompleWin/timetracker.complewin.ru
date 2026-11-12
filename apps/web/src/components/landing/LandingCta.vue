<script setup lang="ts">
import { Play } from "@lucide/vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div class="relative inline-flex">
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-[18px] top-3.5 -bottom-2.5 rounded-full bg-cta-glow opacity-60 blur-[18px] motion-safe:animate-glow motion-reduce:hidden"
    />
    <a
      href="/login"
      class="relative z-[1] isolate inline-flex min-h-[60px] items-center gap-3.5 overflow-hidden rounded-full bg-primary py-2 pr-[30px] pl-2.5 text-[clamp(13px,3.6vw,15px)] leading-none font-extrabold tracking-[0.1em] whitespace-nowrap text-white uppercase no-underline transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:hover:-translate-y-0.5"
    >
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 -z-[1] bg-cta-sheen motion-safe:animate-sheen motion-reduce:hidden"
      />
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 left-0 -z-[1] w-[42%] bg-cta-glint motion-safe:animate-glint motion-reduce:hidden"
      />
      <span
        aria-hidden="true"
        class="relative flex size-10 flex-none items-center justify-center rounded-full bg-white text-primary"
      >
        <Play :size="14" class="translate-x-px fill-current" />
      </span>
      <span class="relative">{{ t("guest.tryFree") }}</span>
    </a>
  </div>
</template>
