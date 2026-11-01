<script setup lang="ts">
import { locales, safeReturnTo, type Locale, type MessageKey } from "@stt/shared";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { fetchEnvironment } from "../api.ts";
import AppButton from "../components/ui/AppButton.vue";
import AppChip from "../components/ui/AppChip.vue";
import AppFormError from "../components/ui/AppFormError.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import { applyLocale, rememberLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";

const errorMessages: Record<string, MessageKey> = {
  cancelled: "login.error.cancelled",
  state: "login.error.state",
  token: "login.error.failed",
  unavailable: "login.error.failed",
};

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const isDev = ref(false);

const returnTo = computed(() => safeReturnTo(queryValue("returnTo")));
const telegramStartUrl = computed(
  () => `/auth/telegram/start?${new URLSearchParams({ returnTo: returnTo.value })}`,
);
const errorMessage = computed(() => {
  const key = errorMessages[queryValue("error") ?? ""];
  return key === undefined ? undefined : t(key);
});

onMounted(async () => {
  isDev.value = (await fetchEnvironment().catch(() => undefined)) === "dev";
});

function queryValue(name: string): string | undefined {
  const value = route.query[name];
  return typeof value === "string" ? value : undefined;
}

function chooseLocale(locale: Locale): void {
  applyLocale(locale);
  rememberLocale(locale);
}

async function signInAsTestUser(): Promise<void> {
  await session.signInAsTestUser();
  await router.push(returnTo.value);
}
</script>

<template>
  <AppIsland class="mx-auto mt-8 w-full max-w-[460px] md:mt-16">
    <h1 class="text-form-title md:text-form-title-lg">{{ t("login.title") }}</h1>
    <div class="mt-6 flex flex-col gap-3">
      <AppFormError v-if="errorMessage" placement="form">{{ errorMessage }}</AppFormError>
      <AppButton :href="telegramStartUrl" size="lg" width="full">
        {{ t("login.withTelegram") }}
      </AppButton>
      <AppButton v-if="isDev" variant="outline-gray" width="full" @click="signInAsTestUser">
        {{ t("login.asTestUser") }}
      </AppButton>
    </div>
    <div class="mt-6 flex flex-wrap gap-2">
      <AppChip
        v-for="option in locales"
        :key="option"
        :active="option === locale"
        @click="chooseLocale(option)"
      >
        {{ t(`language.${option}`) }}
      </AppChip>
    </div>
  </AppIsland>
</template>
