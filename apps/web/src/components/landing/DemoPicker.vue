<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpRight, Play, Plus, Search, Star } from "@lucide/vue";
import { formatDuration } from "@stt/shared";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../../i18n.ts";
import {
  PROJECT_COLORS,
  PROJECT_NAMES,
  taskName,
  taskProject,
  type DemoPicker,
  type DemoPin,
} from "../../landing-demo.ts";
import AppKbd from "../ui/AppKbd.vue";
import AppPulseDot from "../ui/AppPulseDot.vue";
import AppSectionLabel from "../ui/AppSectionLabel.vue";
import ProjectMarker from "../ui/ProjectMarker.vue";

defineProps<{ picker: DemoPicker; pins: DemoPin[]; runningClock: string }>();

const { t } = useI18n();
</script>

<template>
  <div
    class="pointer-events-none overflow-hidden rounded-island border border-line bg-surface-island shadow-popover [transition:opacity_200ms,transform_200ms,visibility_200ms]"
    :class="picker.open ? 'opacity-100' : 'invisible -translate-y-1.5 opacity-0'"
  >
    <div class="flex gap-2 px-3 pt-3 pb-2.5">
      <div
        class="relative flex h-12 min-w-0 flex-1 items-center rounded-full border-2 border-primary pr-4 pl-11 text-input"
      >
        <Search :size="17" class="absolute inset-y-0 left-4 my-auto text-fg-faint" />
        <span v-if="picker.query !== ''" class="whitespace-nowrap text-fg">{{ picker.query }}</span>
        <span class="ml-px inline-block h-[18px] w-0.5 flex-none bg-fg motion-safe:animate-caret" />
        <span v-if="picker.query === ''" class="truncate text-fg-faint">
          {{ t("picker.placeholder") }}
        </span>
      </div>
      <span
        class="flex size-12 flex-none items-center justify-center rounded-full border border-line-strong"
        :class="picker.query === '' ? 'text-fg-faint' : 'text-primary'"
      >
        <Plus :size="17" />
      </span>
    </div>
    <div v-if="picker.query === ''" class="flex flex-wrap gap-2 px-3 pb-2">
      <span
        v-for="pin in pins"
        :key="pin.task"
        :data-demo-target="pin.target ?? undefined"
        class="inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-meta whitespace-nowrap text-primary-ink transition-colors duration-150"
        :class="pin.pressed ? 'bg-primary-soft-hover' : 'bg-primary-soft'"
      >
        {{ taskName(pin.task, currentLocale()) }}
        <Star :size="13" class="flex-none fill-current text-project-yellow" />
      </span>
    </div>
    <div class="px-2 pb-2">
      <AppSectionLabel class="px-3 pt-3 pb-1">
        {{ t(picker.query === "" ? "picker.recent" : "picker.found") }}
      </AppSectionLabel>
      <div
        v-for="row in picker.rows"
        :key="row.task"
        :data-demo-target="row.target ?? undefined"
        class="flex min-h-[42px] items-center gap-2.5 rounded-field pr-1.5 pl-3"
        :class="{ 'bg-surface-page': row.highlighted }"
      >
        <AppPulseDot v-if="row.running" :size="8" />
        <span class="min-w-0 flex-1 truncate text-body text-fg">
          {{ taskName(row.task, currentLocale()) }}
        </span>
        <span class="inline-flex items-center gap-1.5 text-meta whitespace-nowrap text-fg-subtle">
          <ProjectMarker :color="PROJECT_COLORS[taskProject(row.task)]" :size="8" />
          {{ t(PROJECT_NAMES[taskProject(row.task)]) }}
        </span>
        <span v-if="row.running" class="font-code text-meta text-primary tabular-nums">
          {{ runningClock }}
        </span>
        <span
          v-else-if="row.todaySec >= 60"
          class="font-code text-meta whitespace-nowrap text-fg-subtle"
        >
          {{ formatDuration(row.todaySec, currentLocale()) }}
        </span>
        <span class="flex items-center">
          <span class="flex size-8 items-center justify-center">
            <Star
              :size="15"
              :class="row.pinned ? 'fill-current text-project-yellow' : 'text-fg-faint'"
            />
          </span>
          <span class="flex size-8 items-center justify-center text-fg-subtle">
            <ArrowUpRight :size="15" />
          </span>
          <span
            v-if="row.highlighted && !row.running"
            class="flex size-8 items-center justify-center rounded-full bg-primary text-white"
          >
            <Play :size="11" class="translate-x-px fill-current" />
          </span>
        </span>
      </div>
      <div
        v-if="picker.createText !== null"
        class="mt-1 flex min-h-[46px] items-center gap-2.5 rounded-field px-3"
      >
        <Plus :size="17" class="flex-none text-primary" />
        <span class="min-w-0 flex-1 truncate text-body font-semibold text-primary">
          {{ t("picker.createTask", { text: picker.createText }) }}
        </span>
        <span class="text-meta whitespace-nowrap text-fg-subtle">
          {{ t("picker.withoutProject") }}
        </span>
      </div>
    </div>
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-surface-page px-4 py-2.5 text-meta text-fg-subtle"
    >
      <span class="inline-flex items-center gap-1.5">
        <AppKbd>#</AppKbd>
        {{ t("picker.hintProject") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <AppKbd><ArrowUp :size="13" /><ArrowDown :size="13" /></AppKbd>
        {{ t("picker.hintSelect") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <AppKbd>Esc</AppKbd>
        {{ t("picker.hintClose") }}
      </span>
    </div>
  </div>
</template>
