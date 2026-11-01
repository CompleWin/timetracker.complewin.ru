<script setup lang="ts">
import { RouterView } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
</script>

<template>
  <AppHeader />
  <main class="mx-auto flex max-w-(--content-narrow) flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
    <RouterView />
  </main>
</template>
