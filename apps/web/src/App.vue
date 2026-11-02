<script setup lang="ts">
import { WifiOff } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { RouterView } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import AppBanner from "./components/ui/AppBanner.vue";
import { isOnline } from "./connection.ts";

const { t } = useI18n();
</script>

<template>
  <AppHeader />
  <AppBanner v-if="!isOnline" :icon="WifiOff">{{ t("connection.offline") }}</AppBanner>
  <main class="mx-auto flex max-w-(--content-narrow) flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
    <RouterView />
  </main>
</template>
