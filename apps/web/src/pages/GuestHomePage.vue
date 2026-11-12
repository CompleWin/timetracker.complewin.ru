<script setup lang="ts">
import { onUnmounted, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import LandingDemo from "../components/landing/LandingDemo.vue";
import LandingFeatures from "../components/landing/LandingFeatures.vue";
import LandingHero from "../components/landing/LandingHero.vue";
import LandingNotion from "../components/landing/LandingNotion.vue";

const { t } = useI18n();

watchEffect(() => (document.title = t("guest.title")));
onUnmounted(() => (document.title = t("app.name")));
</script>

<template>
  <section class="relative pt-[clamp(28px,5vw,56px)] pb-14">
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 bg-hero-dots" />
    <LandingHero />
    <LandingDemo />
  </section>
  <LandingFeatures />
  <LandingNotion />
</template>
