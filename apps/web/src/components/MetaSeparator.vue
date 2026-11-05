<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <span aria-hidden="true">{{ t("meta.separator") }}</span>
</template>
