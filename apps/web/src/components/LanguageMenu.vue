<script setup lang="ts">
import { Check, ChevronDown, Globe } from "@lucide/vue";
import { locales, type Locale } from "@stt/shared";
import { onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { applyLocale, currentLocale, rememberLocale } from "../i18n.ts";

const { t } = useI18n();
const open = ref(false);
const root = useTemplateRef("root");
const trigger = useTemplateRef("trigger");
const listId = useId();

watch(open, (isOpen) => {
  if (isOpen) listen();
  else stopListening();
});

onBeforeUnmount(stopListening);

function choose(locale: Locale): void {
  applyLocale(locale);
  rememberLocale(locale);
  open.value = false;
}

function closeOnPressOutside(event: PointerEvent): void {
  if (event.target instanceof Node && root.value?.contains(event.target)) return;
  open.value = false;
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  open.value = false;
  trigger.value?.focus();
}

function listen(): void {
  document.addEventListener("pointerdown", closeOnPressOutside, true);
  document.addEventListener("keydown", closeOnEscape);
}

function stopListening(): void {
  document.removeEventListener("pointerdown", closeOnPressOutside, true);
  document.removeEventListener("keydown", closeOnEscape);
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-label="t('language.label')"
      :title="t('language.label')"
      class="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-full pr-2.5 pl-3 text-small font-semibold text-fg-muted transition-colors duration-150 hover:bg-primary-soft hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:min-h-11"
      :class="{ 'bg-primary-soft': open }"
      @click="open = !open"
    >
      <Globe :size="16" aria-hidden="true" class="flex-none" />
      <span aria-hidden="true" class="uppercase">{{ currentLocale() }}</span>
      <ChevronDown
        :size="14"
        aria-hidden="true"
        class="flex-none transition-transform duration-200 motion-reduce:transition-none"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <Transition
      enter-from-class="opacity-0 -translate-y-1"
      leave-to-class="opacity-0 -translate-y-1"
      enter-active-class="motion-safe:transition motion-safe:duration-150"
      leave-active-class="motion-safe:transition motion-safe:duration-150"
    >
      <ul
        v-if="open"
        :id="listId"
        role="listbox"
        :aria-label="t('language.label')"
        class="absolute top-[calc(100%+8px)] right-0 z-30 w-[200px] rounded-panel border border-line bg-surface-island p-1.5 shadow-popover"
      >
        <li
          v-for="locale in locales"
          :key="locale"
          role="option"
          :aria-selected="locale === currentLocale()"
          tabindex="0"
          class="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-field pr-2.5 pl-3 text-body transition-colors duration-150 hover:bg-surface-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="locale === currentLocale() ? 'font-semibold text-primary' : 'text-fg'"
          @click="choose(locale)"
          @keydown.enter.prevent="choose(locale)"
          @keydown.space.prevent="choose(locale)"
        >
          <span class="min-w-0 flex-1">{{ t(`language.${locale}`) }}</span>
          <span aria-hidden="true" class="font-code text-meta font-normal text-fg-faint uppercase">
            {{ locale }}
          </span>
          <Check
            :size="16"
            aria-hidden="true"
            class="flex-none text-primary"
            :class="{ invisible: locale !== currentLocale() }"
          />
        </li>
      </ul>
    </Transition>
  </div>
</template>
