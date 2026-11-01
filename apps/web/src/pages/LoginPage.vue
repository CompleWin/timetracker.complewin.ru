<script setup lang="ts">
import { locales, safeReturnTo, type Locale, type MessageKey } from "@stt/shared";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { fetchEnvironment } from "../api.ts";
import { applyLocale, rememberLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";

const errorMessages: Record<string, MessageKey> = {
  cancelled: "login.error.cancelled",
  state: "login.error.state",
  token: "login.error.failed",
  unavailable: "login.error.failed",
};

const { t } = useI18n();
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
  <main>
    <h2>{{ t("login.title") }}</h2>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <a :href="telegramStartUrl">{{ t("login.withTelegram") }}</a>
    <button v-if="isDev" type="button" @click="signInAsTestUser">
      {{ t("login.asTestUser") }}
    </button>
    <div>
      <button v-for="locale in locales" :key="locale" type="button" @click="chooseLocale(locale)">
        {{ t(`language.${locale}`) }}
      </button>
    </div>
  </main>
</template>
