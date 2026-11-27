<script setup lang="ts">
import { WifiOff } from "@lucide/vue";
import { computed, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { RouterView, useRoute } from "vue-router";
import { useAutoRefresh } from "./auto-refresh.ts";
import AppFooter from "./components/AppFooter.vue";
import AppHeader from "./components/AppHeader.vue";
import AppBanner from "./components/ui/AppBanner.vue";
import { isOnline } from "./connection.ts";
import { useSessionStore } from "./stores/session.ts";

const { t } = useI18n();
const route = useRoute();
const session = useSessionStore();
useAutoRefresh(session.refreshShowGaps);

const onGuestLanding = computed(() => route.meta.landing === true && session.isGuest);

watchEffect(() => {
  if (route.matched.length === 0) return;
  document.title = t(onGuestLanding.value ? "guest.title" : (route.meta.title ?? "app.name"));
});

const mainClasses = computed(() => {
  if (onGuestLanding.value) return "w-full overflow-x-clip";
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
