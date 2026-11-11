<script setup lang="ts">
import { WifiOff } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterView, useRoute } from "vue-router";
import AppFooter from "./components/AppFooter.vue";
import AppHeader from "./components/AppHeader.vue";
import AppBanner from "./components/ui/AppBanner.vue";
import { isOnline } from "./connection.ts";

const { t } = useI18n();
const route = useRoute();

const contentWidth = computed(() =>
  route.meta.narrow === true ? "max-w-(--content-narrow)" : "max-w-(--content-max)",
);
</script>

<template>
  <AppHeader />
  <AppBanner v-if="!isOnline" :icon="WifiOff">{{ t("connection.offline") }}</AppBanner>
  <main class="mx-auto flex w-full flex-col gap-5 px-4 pt-1 pb-8 md:px-8" :class="contentWidth">
    <RouterView />
  </main>
  <AppFooter />
</template>
