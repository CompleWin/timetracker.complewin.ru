<script setup lang="ts">
import { computed } from "vue";

type ButtonVariant =
  "solid-primary" | "outline-primary" | "outline-gray" | "outline-white" | "ghost";
type ButtonSize = "sm" | "md" | "lg";
type ButtonWidth = "auto" | "full" | "full-on-mobile";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    width?: ButtonWidth;
    href?: string;
    type?: "button" | "submit";
    disabled?: boolean;
  }>(),
  { variant: "solid-primary", size: "md", width: "auto", href: undefined, type: "button" },
);

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full py-2 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed";

const ACTION_TYPOGRAPHY = "font-extrabold uppercase leading-none tracking-[0.1em]";

const variantClasses: Record<ButtonVariant, string> = {
  "solid-primary":
    "bg-primary text-white hover:bg-primary-hover disabled:bg-surface-active disabled:text-fg-faint",
  "outline-primary":
    "border-2 border-primary text-primary hover:bg-primary-soft disabled:opacity-50",
  "outline-gray":
    "border-2 border-line-strong text-fg-muted hover:border-fg hover:text-fg disabled:opacity-50",
  "outline-white":
    "border-2 border-white text-white hover:bg-white hover:text-primary disabled:opacity-50",
  ghost: "text-primary hover:bg-primary-soft disabled:opacity-50",
};

const actionSizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[38px] px-5 text-[12px] max-md:min-h-11",
  md: "min-h-[46px] px-[26px] text-[13px]",
  lg: "min-h-[52px] px-8 text-[14px]",
};

const quietSizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[38px] px-3 text-small max-md:min-h-11",
  md: "min-h-[46px] px-4 text-body",
  lg: "min-h-[52px] px-6 text-lead",
};

const widthClasses: Record<ButtonWidth, string> = {
  auto: "",
  full: "w-full",
  "full-on-mobile": "max-md:min-h-12 max-md:w-full",
};

const classes = computed(() => {
  const isQuiet = props.variant === "ghost";
  return [
    BASE,
    variantClasses[props.variant],
    isQuiet ? quietSizeClasses[props.size] : actionSizeClasses[props.size],
    isQuiet ? "" : ACTION_TYPOGRAPHY,
    widthClasses[props.width],
  ];
});
</script>

<template>
  <a v-if="href !== undefined" :href :class="classes">
    <slot />
  </a>
  <button v-else :type :disabled :class="classes">
    <slot />
  </button>
</template>
