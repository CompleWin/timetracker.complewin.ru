<script setup lang="ts">
import { WifiOff } from "@lucide/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterView, useRoute } from "vue-router";
import AppFooter from "./components/AppFooter.vue";
import AppHeader from "./components/AppHeader.vue";
import AppBanner from "./components/ui/AppBanner.vue";
import { isOnline } from "./connection.ts";
import { useSessionStore } from "./stores/session.ts";

const { t } = useI18n();
const route = useRoute();
const session = useSessionStore();

const mainClasses = computed(() => {
  if (route.path === "/" && session.isGuest) return "w-full overflow-x-clip";
  const width = route.meta.narrow === true ? "max-w-(--content-narrow)" : "max-w-(--content-max)";
  return ["mx-auto flex w-full flex-col gap-5 px-4 pt-1 pb-8 md:px-8", width];
});
</script>

<template>
  <AppHeader />
  <AppBanner v-if="!isOnline" :icon="WifiOff">{{ t("connection.offline") }}</AppBanner>
  <main :class="mainClasses">
    <RouterView />
  </main>
  <AppFooter />
</template>
