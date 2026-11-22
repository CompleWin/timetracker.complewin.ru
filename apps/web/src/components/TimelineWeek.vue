<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "@lucide/vue";
import {
  formatWeekdayDate,
  formatWeekdayShort,
  formatWeekRange,
  type CalendarDay,
  type DayRange,
} from "@stt/shared";
import { computed, nextTick, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import AppButton from "./ui/AppButton.vue";
import AppIconButton from "./ui/AppIconButton.vue";

const props = defineProps<{
  days: CalendarDay[];
  selected: DayRange;
  today: DayRange;
}>();
const emit = defineEmits<{
  select: [day: DayRange];
  shiftWeek: [direction: -1 | 1];
}>();

const { t } = useI18n();
const daysGroup = useTemplateRef("daysGroup");

const weekLabel = computed(() => {
  const first = props.days[0];
  const last = props.days.at(-1);
  if (!first || !last) return "";
  return formatWeekRange(first.date, last.date, null, currentLocale());
});
const buttons = computed(() => {
  const locale = currentLocale();
  return props.days.map(({ date, range }) => ({
    date,
    range,
    number: Number(date.slice(8, 10)),
    weekday: formatWeekdayShort(date, null, locale),
    label: formatWeekdayDate(date, null, locale),
    selected: range?.from === props.selected.from,
    today: range?.from === props.today.from,
    future: range !== null && range.from > props.today.from,
  }));
});
const canGoNext = computed(() => buttons.value.every((button) => !button.today && !button.future));

async function returnToToday(): Promise<void> {
  emit("select", props.today);
  await nextTick();
  daysGroup.value?.querySelector<HTMLButtonElement>('button[aria-current="date"]')?.focus({
    preventScroll: true,
  });
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex min-h-[46px] items-center justify-between gap-2">
      <span class="text-meta text-fg-subtle">{{ weekLabel }}</span>
      <AppButton
        v-if="selected.from !== today.from"
        variant="quiet-accent"
        class="shrink-0"
        @click="returnToToday"
      >
        {{ t("timeline.today") }}
      </AppButton>
    </div>
    <div
      ref="daysGroup"
      role="group"
      :aria-label="t('timeline.week')"
      class="flex w-full items-center gap-1"
    >
      <AppIconButton
        size="sm"
        class="max-md:size-8!"
        :label="t('timeline.previousWeek')"
        @click="emit('shiftWeek', -1)"
      >
        <ChevronLeft :size="18" aria-hidden="true" />
      </AppIconButton>
      <button
        v-for="button in buttons"
        :key="button.date"
        type="button"
        :aria-label="button.label"
        :aria-pressed="button.selected"
        :aria-current="button.today ? 'date' : undefined"
        :disabled="button.future || button.range === null"
        class="group flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-field py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        @click="button.range && emit('select', button.range)"
      >
        <span
          class="flex size-8 items-center justify-center rounded-full text-small font-semibold"
          :class="{
            'bg-primary text-white': button.selected,
            'border-2 border-primary bg-surface-island text-primary':
              button.today && !button.selected,
            'border border-line-strong bg-surface-island text-fg group-enabled:group-hover:bg-surface-active':
              !button.today && !button.selected,
          }"
        >
          {{ button.number }}
        </span>
        <span
          class="text-meta capitalize"
          :class="button.selected || button.today ? 'text-fg' : 'text-fg-subtle'"
        >
          {{ button.weekday }}
        </span>
      </button>
      <AppIconButton
        size="sm"
        class="max-md:size-8!"
        :label="t('timeline.nextWeek')"
        :disabled="!canGoNext"
        @click="emit('shiftWeek', 1)"
      >
        <ChevronRight :size="18" aria-hidden="true" />
      </AppIconButton>
    </div>
  </div>
</template>
