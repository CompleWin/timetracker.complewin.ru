<script setup lang="ts">
import { useI18n } from "vue-i18n";
import LocaleChips from "../components/LocaleChips.vue";
import AppButton from "../components/ui/AppButton.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import { APP_ICON } from "../app-icon.ts";

const { t } = useI18n();
</script>

<template>
  <AppIsland
    class="mx-auto mt-8 flex w-full max-w-[560px] flex-col items-center text-center md:mt-16"
  >
    <img :src="APP_ICON" alt="" class="size-16 rounded-[14px]" />
    <h1 class="mt-4 text-form-title md:text-form-title-lg">{{ t("app.name") }}</h1>
    <p class="mt-3 text-body text-fg-muted">{{ t("guest.description") }}</p>
    <AppButton href="/login" size="lg" width="full-on-mobile" class="mt-6">
      {{ t("guest.tryFree") }}
    </AppButton>
    <LocaleChips class="mt-6 justify-center" />
  </AppIsland>
</template>
