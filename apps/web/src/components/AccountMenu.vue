<script setup lang="ts">
import { Archive, Check, ChevronDown, LogOut, Settings, Timer, type LucideIcon } from "@lucide/vue";
import { t as translate, type MessageKey, type User } from "@stt/shared";
import { computed, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { currentLocale } from "../i18n.ts";
import { useSessionStore } from "../stores/session.ts";

type MenuSection = { path: string; label: MessageKey; icon: LucideIcon };

const SECTIONS: MenuSection[] = [
  { path: "/", label: "header.tracker", icon: Timer },
  { path: "/archive", label: "header.archive", icon: Archive },
  { path: "/settings", label: "header.settings", icon: Settings },
];

const TRACKER_PATH = "/";

const props = defineProps<{ user: User }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const panelId = useId();
const root = useTemplateRef("root");
const trigger = useTemplateRef("trigger");
const open = ref(false);

const initial = computed(() => props.user.name.trim().charAt(0).toLocaleUpperCase());
const signInLine = computed(() =>
  props.user.username === null
    ? t("header.signedIn")
    : translate(currentLocale(), "header.signedInAs", { username: props.user.username }),
);
const currentPath = computed(() =>
  SECTIONS.some((section) => section.path === route.path) ? route.path : TRACKER_PATH,
);

watch(open, (isOpen) => (isOpen ? listenForDismiss() : stopListening()));
watch(() => route.fullPath, close);

onBeforeUnmount(stopListening);

function close(): void {
  open.value = false;
}

function closeOnPressOutside(event: PointerEvent): void {
  if (!(event.target instanceof Node && root.value?.contains(event.target))) close();
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  close();
  trigger.value?.focus();
}

function listenForDismiss(): void {
  document.addEventListener("pointerdown", closeOnPressOutside, true);
  document.addEventListener("keydown", closeOnEscape);
}

function stopListening(): void {
  document.removeEventListener("pointerdown", closeOnPressOutside, true);
  document.removeEventListener("keydown", closeOnEscape);
}

async function signOut(): Promise<void> {
  close();
  await session.signOut();
  await router.push("/login");
}
</script>

<template>
  <div ref="root" class="relative ml-auto">
    <button
      ref="trigger"
      type="button"
      :aria-label="t('header.menu')"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      class="flex h-11 cursor-pointer items-center gap-2 rounded-full pr-2.5 pl-1.5 text-fg transition-colors duration-150 hover:bg-surface-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="{ 'bg-surface-active': open }"
      @click="open = !open"
    >
      <span
        aria-hidden="true"
        class="flex size-8 flex-none items-center justify-center rounded-full bg-primary-soft text-meta font-semibold text-primary-ink"
      >
        {{ initial }}
      </span>
      <span class="max-w-48 truncate text-small max-md:hidden">{{ user.name }}</span>
      <ChevronDown :size="17" aria-hidden="true" class="flex-none text-fg-subtle" />
    </button>
    <div
      v-if="open"
      :id="panelId"
      class="absolute top-full right-0 z-50 mt-2 flex w-[268px] max-w-[calc(100vw-32px)] flex-col rounded-panel border border-line bg-surface-island p-2 shadow-popover"
    >
      <div class="px-3 py-2">
        <p class="text-body font-semibold break-words">{{ user.name }}</p>
        <p class="text-meta break-words text-fg-subtle">{{ signInLine }}</p>
      </div>
      <div class="my-1 border-t border-line" />
      <RouterLink
        v-for="section in SECTIONS"
        :key="section.path"
        :to="section.path"
        :aria-current="section.path === currentPath ? 'page' : undefined"
        class="flex min-h-[44px] items-center gap-3 rounded-field px-3 text-body text-fg no-underline transition-colors duration-150 hover:bg-surface-page hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="{ 'bg-surface-page': section.path === currentPath }"
        @click="close"
      >
        <component :is="section.icon" :size="17" aria-hidden="true" class="flex-none" />
        <span class="flex-1">{{ t(section.label) }}</span>
        <Check
          v-if="section.path === currentPath"
          :size="17"
          aria-hidden="true"
          class="flex-none text-primary"
        />
      </RouterLink>
      <div class="my-1 border-t border-line" />
      <button
        type="button"
        class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-field px-3 text-left text-body text-fg-muted transition-colors duration-150 hover:bg-surface-page hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="signOut"
      >
        <LogOut :size="17" aria-hidden="true" class="flex-none" />
        {{ t("header.signOut") }}
      </button>
    </div>
  </div>
</template>
