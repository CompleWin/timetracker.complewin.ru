<script setup lang="ts">
import { Ellipsis, type LucideIcon } from "@lucide/vue";
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import AppIconButton, { type IconButtonSize, type IconButtonTone } from "./AppIconButton.vue";

export type MenuItem = {
  label: string;
  icon: LucideIcon;
  select: () => void;
};

type MenuPosition = { top: number; right: number };

const MENU_OFFSET_PX = 8;

withDefaults(
  defineProps<{
    label: string;
    items: MenuItem[];
    icon?: LucideIcon;
    size?: IconButtonSize;
    tone?: IconButtonTone;
  }>(),
  { icon: undefined, size: "md", tone: "calm" },
);

const isOpen = ref(false);
const position = ref<MenuPosition>({ top: 0, right: 0 });
const menuId = useId();
const root = useTemplateRef("root");

watch(isOpen, (open) => (open ? listenForMoves() : stopListening()));

onBeforeUnmount(stopListening);

async function toggle(): Promise<void> {
  if (isOpen.value) return close();
  position.value = placeUnder(trigger());
  isOpen.value = true;
  await nextTick();
  menuItems()[0]?.focus({ preventScroll: true });
}

function close(): void {
  isOpen.value = false;
  trigger()?.focus();
}

function dismiss(): void {
  isOpen.value = false;
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
    event.stopPropagation();
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

function placeUnder(element: HTMLElement | null | undefined): MenuPosition {
  const rect = element?.getBoundingClientRect();
  if (rect === undefined) return { top: 0, right: 0 };
  return {
    top: rect.bottom + MENU_OFFSET_PX,
    right: document.documentElement.clientWidth - rect.right,
  };
}

function trigger(): HTMLElement | null | undefined {
  return root.value?.querySelector<HTMLElement>("[aria-haspopup]");
}

function menuItems(): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
}

function listenForMoves(): void {
  window.addEventListener("scroll", dismiss, true);
  window.addEventListener("resize", dismiss);
}

function stopListening(): void {
  window.removeEventListener("scroll", dismiss, true);
  window.removeEventListener("resize", dismiss);
}
</script>

<template>
  <div ref="root" class="relative" @keydown="onKeydown" @focusout="closeWhenFocusLeaves">
    <AppIconButton
      :label
      :size
      :tone
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? menuId : undefined"
      @click="toggle"
    >
      <component :is="icon ?? Ellipsis" :size="17" aria-hidden="true" />
    </AppIconButton>
    <div
      v-if="isOpen"
      :id="menuId"
      role="menu"
      :aria-label="label"
      tabindex="-1"
      class="fixed z-50 flex min-w-44 flex-col rounded-panel border border-line bg-surface-island px-2 py-2 shadow-popover"
      :style="{ top: `${position.top}px`, right: `${position.right}px` }"
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
