<script setup lang="ts">
import LandingDemo from "../components/landing/LandingDemo.vue";
import LandingFeatures from "../components/landing/LandingFeatures.vue";
import LandingHero from "../components/landing/LandingHero.vue";
import LandingNotion from "../components/landing/LandingNotion.vue";
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
