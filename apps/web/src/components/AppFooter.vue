<script setup lang="ts">
import type { MessageKey } from "@stt/shared";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

const LINKS: { path: string; label: MessageKey }[] = [
  { path: "/privacy", label: "footer.privacy" },
  { path: "/terms", label: "footer.terms" },
];

const { t } = useI18n();
</script>

<template>
  <footer
    class="mx-auto flex w-full max-w-(--content-max) flex-wrap gap-x-4 gap-y-1 px-4 pt-6 pb-8 text-meta md:px-8"
  >
    <RouterLink
      v-for="link in LINKS"
      :key="link.path"
      :to="link.path"
      class="text-fg-subtle no-underline hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {{ t(link.label) }}
    </RouterLink>
  </footer>
</template>
