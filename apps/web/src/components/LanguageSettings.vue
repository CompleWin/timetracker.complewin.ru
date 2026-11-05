<script setup lang="ts">
import { locales } from "@stt/shared";
import { useId } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";
import AppChip from "./ui/AppChip.vue";
import AppIsland from "./ui/AppIsland.vue";

const { t } = useI18n();
const session = useSessionStore();
const titleId = useId();
</script>

<template>
  <AppIsland as="section" :aria-labelledby="titleId">
    <h2 :id="titleId" class="text-title">{{ t("language.label") }}</h2>
    <p class="mt-2 text-body text-fg-muted">{{ t("language.description") }}</p>
    <div class="mt-4 flex flex-wrap gap-2">
      <AppChip
        v-for="option in locales"
        :key="option"
        :active="option === currentLocale()"
        class="min-h-10"
        @click="session.changeLocale(option)"
      >
        {{ t(`language.${option}`) }}
      </AppChip>
    </div>
  </AppIsland>
</template>
