<script setup lang="ts">
import { Ellipsis, type LucideIcon } from "@lucide/vue";
import { nextTick, ref, useId, useTemplateRef } from "vue";
import AppIconButton from "./AppIconButton.vue";

export type MenuItem = {
  label: string;
  icon: LucideIcon;
  select: () => void;
};

defineProps<{ label: string; items: MenuItem[] }>();

const isOpen = ref(false);
const menuId = useId();
const root = useTemplateRef("root");

async function toggle(): Promise<void> {
  if (isOpen.value) return close();
  isOpen.value = true;
  await nextTick();
  menuItems()[0]?.focus();
}

function close(): void {
  isOpen.value = false;
  root.value?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
}

function choose(item: MenuItem): void {
  close();
  item.select();
}

function closeWhenFocusLeaves(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && root.value?.contains(next)) return;
  isOpen.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveFocus(event.key === "ArrowDown" ? 1 : -1);
  }
}

function moveFocus(step: number): void {
  const items = menuItems();
  const current = items.findIndex((item) => item === document.activeElement);
  items[(current + step + items.length) % items.length]?.focus();
}

function menuItems(): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
}
</script>

<template>
  <div ref="root" class="relative" @keydown="onKeydown" @focusout="closeWhenFocusLeaves">
    <AppIconButton
      :label
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? menuId : undefined"
      @click="toggle"
    >
      <Ellipsis :size="17" aria-hidden="true" />
    </AppIconButton>
    <div
      v-if="isOpen"
      :id="menuId"
      role="menu"
      :aria-label="label"
      tabindex="-1"
      class="absolute top-full right-0 z-50 mt-2 flex min-w-44 flex-col rounded-panel border border-line bg-surface-island px-2 py-2 shadow-popover"
    >
      <button
        v-for="item in items"
        :key="item.label"
        type="button"
        role="menuitem"
        class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-field px-3 text-left text-body whitespace-nowrap text-fg transition-colors duration-150 hover:bg-surface-page hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="choose(item)"
      >
        <component :is="item.icon" :size="17" aria-hidden="true" />
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
