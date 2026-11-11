<script setup lang="ts">
import { ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import DeleteAccountDialog from "./DeleteAccountDialog.vue";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";

const { t } = useI18n();
const titleId = useId();
const deleting = ref(false);
</script>

<template>
  <AppIsland as="section" :aria-labelledby="titleId">
    <h2 :id="titleId" class="text-title">{{ t("account.title") }}</h2>
    <AppButton variant="ghost-danger" class="mt-3" @click="deleting = true">
      {{ t("account.delete") }}
    </AppButton>
    <DeleteAccountDialog v-if="deleting" @close="deleting = false" />
  </AppIsland>
</template>
