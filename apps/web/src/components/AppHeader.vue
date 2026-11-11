<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";
import { APP_ICON } from "../app-icon.ts";
import { useSessionStore } from "../stores/session.ts";
import AccountMenu from "./AccountMenu.vue";

const { t } = useI18n();
const route = useRoute();
const session = useSessionStore();

const logoTag = computed(() => (route.path === "/" && session.isGuest ? "div" : "h1"));
</script>

<template>
  <header class="mx-auto flex max-w-(--content-max) items-center gap-4 px-4 pt-4 pb-3 md:px-8">
    <component :is="logoTag">
      <RouterLink
        to="/"
        class="flex items-center gap-2.5 text-logo text-fg no-underline hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <img :src="APP_ICON" alt="" class="size-[26px] flex-none rounded-[6px]" />
        {{ t("app.name") }}
      </RouterLink>
    </component>
    <AccountMenu v-if="session.user" :user="session.user" />
  </header>
</template>
