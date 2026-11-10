<script setup lang="ts">
import { useI18n } from "vue-i18n";

type MarkSize = "text" | "heading";

withDefaults(defineProps<{ size?: MarkSize }>(), { size: "text" });

const sizeClasses: Record<MarkSize, string> = {
  text: "size-[15px]",
  heading: "size-5",
};

const { t } = useI18n();
</script>

<template>
  <span
    role="img"
    :aria-label="t('tasks.fromNotion')"
    :title="t('tasks.fromNotion')"
    class="inline-flex flex-none text-fg-subtle"
    :class="sizeClasses[size]"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" class="size-full fill-current">
      <path
        fill-rule="evenodd"
        d="M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6Z"
      />
      <path d="M7.5 7h2.2l4.8 6.6V7h2v10h-2.2L9.5 10.4V17h-2V7Z" />
    </svg>
  </span>
</template>
