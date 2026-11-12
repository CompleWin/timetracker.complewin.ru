<script setup lang="ts">
import type { MessageKey } from "@stt/shared";
import { useI18n } from "vue-i18n";
import AppSectionLabel from "../ui/AppSectionLabel.vue";

type Feature = { label: MessageKey; title: MessageKey; text: MessageKey };

const FEATURES: Feature[] = [
  {
    label: "guest.feature.timers.label",
    title: "guest.feature.timers.title",
    text: "guest.feature.timers.text",
  },
  {
    label: "guest.feature.notes.label",
    title: "guest.feature.notes.title",
    text: "guest.feature.notes.text",
  },
  {
    label: "guest.feature.timeline.label",
    title: "guest.feature.timeline.title",
    text: "guest.feature.timeline.text",
  },
  {
    label: "guest.feature.telegram.label",
    title: "guest.feature.telegram.title",
    text: "guest.feature.telegram.text",
  },
  {
    label: "guest.feature.devices.label",
    title: "guest.feature.devices.title",
    text: "guest.feature.devices.text",
  },
];

const { t } = useI18n();
</script>

<template>
  <section
    id="features"
    class="mx-auto max-w-(--content-max) px-[clamp(16px,3vw,32px)] pt-14 pb-6"
    aria-labelledby="features-title"
  >
    <p class="text-caps font-semibold text-primary uppercase">{{ t("guest.features.label") }}</p>
    <h2 id="features-title" class="mt-1.5 mb-5 text-h2">
      {{ t("guest.features.title") }}
    </h2>
    <div class="flex flex-wrap gap-5">
      <article
        v-for="feature in FEATURES"
        :key="feature.label"
        class="min-w-0 flex-[1_1_300px] rounded-island border border-line bg-surface-island p-5"
      >
        <AppSectionLabel>{{ t(feature.label) }}</AppSectionLabel>
        <h3 class="mt-1.5 text-title">{{ t(feature.title) }}</h3>
        <p class="mt-2 text-body leading-[1.6] text-fg-muted">{{ t(feature.text) }}</p>
      </article>
    </div>
  </section>
</template>
