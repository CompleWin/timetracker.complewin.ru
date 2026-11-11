<script setup lang="ts">
import { useSessionStore } from "../stores/session.ts";
import GuestHomePage from "./GuestHomePage.vue";
import HomePage from "./HomePage.vue";

const session = useSessionStore();
</script>

<template>
  <GuestHomePage v-if="session.isGuest" />
  <HomePage v-else />
</template>
