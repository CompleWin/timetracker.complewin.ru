<script setup lang="ts">
import { REPO_URL, type MessageKey } from "@stt/shared";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import GitHubMark from "./ui/GitHubMark.vue";

const LINKS: { path: string; label: MessageKey }[] = [
  { path: "/privacy", label: "footer.privacy" },
  { path: "/terms", label: "footer.terms" },
];

const LINK_CLASSES =
  "text-fg-subtle no-underline hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const { t } = useI18n();
</script>

<template>
  <footer
    class="mx-auto flex w-full max-w-(--content-max) flex-wrap gap-x-4 gap-y-1 px-4 pt-6 pb-8 text-meta md:px-8"
  >
    <RouterLink v-for="link in LINKS" :key="link.path" :to="link.path" :class="LINK_CLASSES">
      {{ t(link.label) }}
    </RouterLink>
    <a
      :href="REPO_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="ml-auto inline-flex items-center gap-1.5"
      :class="LINK_CLASSES"
    >
      <GitHubMark class="size-[15px]" />
      {{ t("repo.github") }}
    </a>
  </footer>
</template>
