<script setup lang="ts">
import { formatDate } from "@stt/shared";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import AppIsland from "../components/ui/AppIsland.vue";
import { currentLocale } from "../i18n.ts";
import { LEGAL_UPDATED_AT, type LegalDocument } from "../legal-documents.ts";
import { useSessionStore } from "../stores/session.ts";

defineProps<{ document: LegalDocument }>();

const { t } = useI18n();
const session = useSessionStore();
const contacts = ref<api.PublisherContacts | null>(null);

const updatedOn = computed(() =>
  formatDate(LEGAL_UPDATED_AT, session.user?.timezone ?? null, currentLocale()),
);

onMounted(async () => {
  contacts.value = await api.fetchPublisherContacts();
});
</script>

<template>
  <AppIsland as="article" class="mx-auto w-full max-w-[720px] text-body">
    <h1 class="text-h2">{{ t(document.title) }}</h1>
    <p class="mt-1 text-meta text-fg-subtle">{{ t("legal.updated", { date: updatedOn }) }}</p>
    <p class="mt-4">{{ t(document.intro) }}</p>
    <section v-for="section in document.sections" :key="section.title">
      <h2 class="mt-6 text-title">{{ t(section.title) }}</h2>
      <p v-if="section.text" class="mt-2">{{ t(section.text) }}</p>
      <ul v-if="section.items" class="mt-2 flex list-disc flex-col gap-1 pl-5">
        <li v-for="item in section.items" :key="item">{{ t(item) }}</li>
      </ul>
    </section>
    <section v-if="contacts">
      <h2 class="mt-6 text-title">{{ t("legal.contacts.title") }}</h2>
      <p class="mt-2">{{ t("legal.contacts.publisher", { name: contacts.publisherName }) }}</p>
      <p class="mt-2">
        {{ t("legal.contacts.email") }}
        <a :href="`mailto:${contacts.supportEmail}`" class="text-primary underline">{{
          contacts.supportEmail
        }}</a>
      </p>
    </section>
  </AppIsland>
</template>
