<script setup lang="ts">
type ChipSize = "sm" | "md";

const props = withDefaults(
  defineProps<{ active: boolean; as?: "button" | "label"; size?: ChipSize }>(),
  { as: "button", size: "md" },
);

const sizeClasses: Record<ChipSize, string> = {
  sm: "px-3 py-1.5 text-meta",
  md: "px-3.5 py-2 text-small",
};

const isButton = props.as === "button";
</script>

<template>
  <component
    :is="as"
    :type="isButton ? 'button' : undefined"
    :aria-pressed="isButton ? active : undefined"
    class="inline-flex cursor-pointer items-center gap-2 rounded-full border whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
    :class="[
      sizeClasses[size],
      active
        ? 'border-primary bg-primary text-white'
        : 'border-line text-fg hover:border-primary hover:text-primary',
    ]"
  >
    <slot />
  </component>
</template>
