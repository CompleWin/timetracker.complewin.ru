<script setup lang="ts">
import { Check } from "@lucide/vue";
import { formatClock, REPO_URL } from "@stt/shared";
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppPulseDot from "../ui/AppPulseDot.vue";
import GitHubMark from "../ui/GitHubMark.vue";
import LandingCta from "./LandingCta.vue";

const TICK_MS = 1000;

const { t } = useI18n();
const secondsOnPage = ref(0);
let openedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  openedAt = Date.now();
  timer = setInterval(
    () => (secondsOnPage.value = Math.floor((Date.now() - openedAt) / TICK_MS)),
    TICK_MS,
  );
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="relative mx-auto flex max-w-[880px] flex-col items-center px-5 text-center">
    <div
      class="inline-flex h-[34px] items-center gap-2 rounded-full border border-line bg-surface-island pr-3.5 pl-3 text-meta whitespace-nowrap text-fg-subtle"
    >
      <AppPulseDot :size="8" />
      <span>{{ t("guest.badge") }}</span>
      <span class="font-code text-primary tabular-nums">{{ formatClock(secondsOnPage) }}</span>
    </div>
    <h1
      class="mt-6 text-[clamp(42px,6.4vw,76px)] leading-none font-extrabold tracking-[-0.04em] text-balance"
    >
      <span class="block text-primary">{{ t("guest.headlineAccent") }}</span>
      {{ t("guest.headlineRest") }}
    </h1>
    <p class="mt-5 max-w-[600px] text-[clamp(17px,1.6vw,20px)] leading-[1.45] text-fg-muted">
      {{ t("guest.subtitle") }}
    </p>
    <div class="mt-8 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-3">
      <LandingCta />
      <a
        :href="REPO_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex min-h-[60px] items-center gap-3 rounded-full border border-line-strong bg-surface-island py-2 pr-7 pl-[22px] text-[clamp(13px,3.6vw,15px)] leading-none font-extrabold tracking-[0.1em] whitespace-nowrap text-fg uppercase no-underline transition-[transform,border-color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-fg hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:hover:-translate-y-0.5"
      >
        <GitHubMark class="size-5" />
        <span>{{ t("guest.star") }}</span>
      </a>
    </div>
    <div class="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-small text-fg-subtle">
      <span class="inline-flex items-center gap-1.5">
        <Check :size="15" :stroke-width="2.4" aria-hidden="true" class="flex-none text-primary" />
        {{ t("guest.openSource") }}
      </span>
    </div>
  </div>
</template>
