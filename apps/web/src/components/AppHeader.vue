<script setup lang="ts">
import { REPO_URL } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";
import { APP_ICON } from "../app-icon.ts";
import { useSessionStore } from "../stores/session.ts";
import AccountMenu from "./AccountMenu.vue";
import LanguageMenu from "./LanguageMenu.vue";
import AppButton from "./ui/AppButton.vue";
import GitHubMark from "./ui/GitHubMark.vue";

const { t } = useI18n();
const route = useRoute();
const session = useSessionStore();

const onGuestHome = computed(() => route.path === "/" && session.isGuest);
const logoTag = computed(() => (onGuestHome.value ? "div" : "h1"));
</script>

<template>
  <header
    class="relative z-40 mx-auto flex max-w-(--content-max) flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-4 pb-3 md:px-8"
  >
    <component :is="logoTag">
      <RouterLink
        to="/"
        :aria-label="t('app.name')"
        class="flex items-center gap-2.5 font-code text-[20px] leading-none font-bold tracking-[-0.04em] text-fg no-underline hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <img :src="APP_ICON" alt="" class="size-[26px] flex-none rounded-[6px]" />
        <span aria-hidden="true" class="flex items-center gap-1.5">
          simple<span class="h-1 w-[9px] rounded-full bg-fg" />time<span
            class="h-1 w-[9px] rounded-full bg-primary"
          />tracker
        </span>
      </RouterLink>
    </component>
    <AccountMenu v-if="session.user" :user="session.user" />
    <div v-else-if="onGuestHome" class="ml-auto flex items-center gap-1">
      <LanguageMenu />
      <a
        :href="REPO_URL"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('repo.github')"
        :title="t('repo.github')"
        class="inline-flex size-[38px] items-center justify-center rounded-full text-fg-muted transition-colors duration-150 hover:bg-primary-soft hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:size-11"
      >
        <GitHubMark class="size-[18px]" />
      </a>
      <AppButton href="/login" variant="quiet-accent" size="sm">
        {{ t("guest.signIn") }}
      </AppButton>
    </div>
  </header>
</template>
