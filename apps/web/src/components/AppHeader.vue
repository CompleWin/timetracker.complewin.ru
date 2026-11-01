<script setup lang="ts">
import { locales, type Locale } from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";

const { t } = useI18n();
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
  <header>
    <h1>{{ t("app.name") }}</h1>
    <div v-if="session.user">
      <span>{{ session.user.name }}</span>
      <label :for="localeSelectId">{{ t("language.label") }}</label>
      <select :id="localeSelectId" v-model="locale">
        <option v-for="option in locales" :key="option" :value="option">
          {{ t(`language.${option}`) }}
        </option>
      </select>
      <button type="button" @click="signOut">{{ t("header.signOut") }}</button>
    </div>
  </header>
</template>
