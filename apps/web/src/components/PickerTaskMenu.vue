<script setup lang="ts">
import { Archive, Pencil, Trash2 } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

export type TaskMenuAction = "edit" | "delete" | "archive";
export type TaskMenuAnchor = { x: number; y: number };

const props = defineProps<{ title: string; anchor: TaskMenuAnchor }>();
const emit = defineEmits<{ select: [action: TaskMenuAction]; close: [restoreFocus: boolean] }>();

const VIEWPORT_MARGIN = 8;

const { t } = useI18n();
const menu = useTemplateRef("menu");
const position = ref<TaskMenuAnchor>(props.anchor);
const items = computed(() => [
  { action: "edit" as const, icon: Pencil, label: t("actions.edit") },
  { action: "archive" as const, icon: Archive, label: t("actions.archive") },
  { action: "delete" as const, icon: Trash2, label: t("tasks.delete") },
]);

watch(() => props.anchor, placeAndFocus, { flush: "post" });

onMounted(() => {
  placeAndFocus();
  document.addEventListener("pointerdown", closeOnOutsidePress, true);
  window.addEventListener("scroll", closeOnScroll, true);
  window.addEventListener("resize", closeAndRestoreFocus);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  window.removeEventListener("scroll", closeOnScroll, true);
  window.removeEventListener("resize", closeAndRestoreFocus);
});

function placeAndFocus(): void {
  const bounds = menu.value?.getBoundingClientRect();
  if (bounds === undefined) return;
  const viewport = document.documentElement;
  position.value = {
    x: insideViewport(props.anchor.x, bounds.width, viewport.clientWidth),
    y: insideViewport(props.anchor.y, bounds.height, viewport.clientHeight),
  };
  menuItems()[0]?.focus({ preventScroll: true });
}

function insideViewport(start: number, size: number, limit: number): number {
  return Math.max(VIEWPORT_MARGIN, Math.min(start, limit - size - VIEWPORT_MARGIN));
}

function menuItems(): HTMLElement[] {
  return Array.from(menu.value?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
}

function closeAndRestoreFocus(): void {
  emit("close", true);
}

function isInsideMenu(target: EventTarget | null): boolean {
  return target instanceof Node && menu.value?.contains(target) === true;
}

function closeOnOutsidePress(event: PointerEvent): void {
  if (!isInsideMenu(event.target)) emit("close", false);
}

function closeOnScroll(event: Event): void {
  if (!isInsideMenu(event.target)) closeAndRestoreFocus();
}

function closeOnFocusOut(event: FocusEvent): void {
  if (!isInsideMenu(event.relatedTarget)) emit("close", false);
}

function onKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "Escape":
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      break;
    case "ArrowDown":
    case "ArrowUp": {
      event.preventDefault();
      const items = menuItems();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus();
      break;
    }
    case "Home":
    case "End":
      event.preventDefault();
      menuItems()
        .at(event.key === "Home" ? 0 : -1)
        ?.focus();
      break;
  }
}
</script>

<template>
  <div
    ref="menu"
    role="menu"
    :aria-label="t('picker.taskActions', { title })"
    class="fixed z-50 flex max-h-[calc(100dvh-16px)] min-w-44 flex-col overflow-y-auto rounded-panel border border-line bg-surface-island p-2 shadow-popover"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @contextmenu.prevent
    @keydown="onKeydown"
    @focusout="closeOnFocusOut"
  >
    <button
      v-for="{ action, icon, label } in items"
      :key="action"
      type="button"
      role="menuitem"
      tabindex="-1"
      class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-field px-3 text-left text-body whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="
        action === 'delete'
          ? 'text-danger-ink hover:bg-danger-soft'
          : 'text-fg hover:bg-surface-page hover:text-primary'
      "
      @click="emit('select', action)"
    >
      <component :is="icon" :size="17" aria-hidden="true" />
      {{ label }}
    </button>
  </div>
</template>
