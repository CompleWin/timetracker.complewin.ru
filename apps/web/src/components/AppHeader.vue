<script setup lang="ts">
import { locales, type Locale, type MessageKey } from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";
import AppButton from "./ui/AppButton.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";

type HeaderSection = { path: string; label: MessageKey };

const SECTIONS: HeaderSection[] = [
  { path: "/archive", label: "header.archive" },
  { path: "/settings", label: "header.settings" },
];

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const localeSelectId = useId();

const locale = computed({
  get: currentLocale,
  set: (value: Locale) => session.changeLocale(value),
});

async function signOut(): Promise<void> {
  await session.signOut();
  await router.push("/login");
}
</script>

<template>
  <header
    class="flex flex-wrap items-center gap-x-8 gap-y-3 bg-primary px-4 py-3.5 text-white md:px-8"
  >
    <h1 class="text-logo max-md:w-full">
      <RouterLink to="/" class="text-white hover:text-white">{{ t("app.name") }}</RouterLink>
    </h1>
    <template v-if="session.user">
      <nav class="flex flex-wrap gap-x-7 gap-y-2">
        <RouterLink
          v-for="section in SECTIONS"
          :key="section.path"
          :to="section.path"
          class="text-tab text-white uppercase decoration-2 underline-offset-4 hover:text-white"
          :class="route.path === section.path ? 'underline' : 'opacity-70 hover:opacity-100'"
        >
          {{ t(section.label) }}
        </RouterLink>
      </nav>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 md:ml-auto">
        <span class="text-small break-all">{{ session.user.name }}</span>
        <div class="flex items-center gap-2">
          <AppSectionLabel as="label" :for="localeSelectId" tone="inverse">
            {{ t("language.label") }}
          </AppSectionLabel>
          <select
            :id="localeSelectId"
            v-model="locale"
            class="h-[38px] cursor-pointer rounded-full border border-transparent bg-white/16 px-3 text-small text-white transition-colors duration-150 hover:bg-white/28 focus:border-white"
          >
            <option v-for="option in locales" :key="option" :value="option" class="text-fg">
              {{ t(`language.${option}`) }}
            </option>
          </select>
        </div>
        <AppButton variant="outline-white" size="sm" @click="signOut">
          {{ t("header.signOut") }}
        </AppButton>
      </div>
    </template>
  </header>
</template>
