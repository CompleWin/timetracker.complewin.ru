<script setup lang="ts">
import { locales, type Locale } from "@stt/shared";
import { useI18n } from "vue-i18n";
import { applyLocale, rememberLocale } from "../i18n.ts";
import AppChip from "./ui/AppChip.vue";

const { t, locale } = useI18n();

function chooseLocale(chosen: Locale): void {
  applyLocale(chosen);
  rememberLocale(chosen);
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <AppChip
      v-for="option in locales"
      :key="option"
      :active="option === locale"
      @click="chooseLocale(option)"
    >
      {{ t(`language.${option}`) }}
    </AppChip>
  </div>
</template>
