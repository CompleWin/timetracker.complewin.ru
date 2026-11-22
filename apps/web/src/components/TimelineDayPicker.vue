<script setup lang="ts">
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "@lucide/vue";
import {
  calendarMonth,
  calendarWeek,
  formatMonthYear,
  formatWeekdayDate,
  formatWeekdayShort,
  toDateTimeLocal,
  type DayRange,
} from "@stt/shared";
import { computed, nextTick, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import AppButton from "./ui/AppButton.vue";
import AppIconButton from "./ui/AppIconButton.vue";

const props = defineProps<{
  selected: DayRange;
  today: DayRange;
  timeZone: string | null;
}>();
const emit = defineEmits<{ select: [day: DayRange] }>();

const { t } = useI18n();
const calendarId = useId();
const root = useTemplateRef("root");
const panel = useTemplateRef("panel");
const isOpen = ref(false);
const monthAnchor = ref(props.selected.from);
const monthOffset = ref(0);
const dateLabel = computed(() =>
  formatWeekdayDate(props.selected.from, props.timeZone, currentLocale()),
);
const selectedDayNumber = computed(() =>
  Number(toDateTimeLocal(props.selected.from, props.timeZone).slice(8, 10)),
);
const month = computed(() => calendarMonth(monthAnchor.value, props.timeZone, monthOffset.value));
const monthLabel = computed(() => formatMonthYear(month.value.start, null, currentLocale()));
const weekdays = computed(() =>
  calendarWeek(month.value.start, null).map(({ date }) =>
    formatWeekdayShort(date, null, currentLocale()),
  ),
);
const days = computed(() => {
  const locale = currentLocale();
  return month.value.days.map(
    (day) =>
      day && {
        number: Number(day.date.slice(8, 10)),
        range: day.range,
        label: formatWeekdayDate(day.date, null, locale),
        selected: day.range?.from === props.selected.from,
        today: day.range?.from === props.today.from,
        future: day.range !== null && day.range.from > props.today.from,
      },
  );
});
const canGoNext = computed(() => days.value.every((day) => !day?.today && !day?.future));

watch(isOpen, (open, _, onCleanup) => {
  if (!open) return;
  document.addEventListener("click", dismissOutside, true);
  document.addEventListener("keydown", dismissOnEscape, true);
  onCleanup(() => {
    document.removeEventListener("click", dismissOutside, true);
    document.removeEventListener("keydown", dismissOnEscape, true);
  });
});

watch([panel, monthOffset], ([element]) => element?.scrollIntoView({ block: "nearest" }), {
  flush: "post",
});

async function toggle(): Promise<void> {
  if (isOpen.value) {
    closeAndFocus();
    return;
  }
  monthAnchor.value = props.selected.from;
  monthOffset.value = 0;
  isOpen.value = true;
  await nextTick();
  panel.value?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({
    preventScroll: true,
  });
}

function closeAndFocus(): void {
  isOpen.value = false;
  root.value?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
}

function choose(day: DayRange): void {
  closeAndFocus();
  emit("select", day);
}

function dismissOutside(event: MouseEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) isOpen.value = false;
}

function dismissOnEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  closeAndFocus();
}
</script>

<template>
  <div ref="root">
    <AppButton
      variant="quiet"
      size="xs"
      class="max-md:size-11 max-md:p-0"
      :aria-label="t('timeline.pickDay', { date: dateLabel })"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? calendarId : undefined"
      @click="toggle"
    >
      <span class="relative size-8 md:hidden" aria-hidden="true">
        <Calendar :size="32" absolute-stroke-width />
        <span
          class="absolute inset-x-0 top-3.5 bottom-1 grid place-items-center leading-none font-semibold"
        >
          {{ selectedDayNumber }}
        </span>
      </span>
      <span class="max-md:hidden">{{ dateLabel }}</span>
      <ChevronDown :size="15" class="max-md:hidden" aria-hidden="true" />
    </AppButton>
    <div
      v-if="isOpen"
      :id="calendarId"
      ref="panel"
      role="region"
      :aria-label="t('calendar.title')"
      class="absolute top-full left-0 z-30 mt-1 w-max max-w-[calc(100vw-32px)] rounded-panel border border-line bg-surface-island p-3 shadow-popover"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <AppIconButton size="sm" :label="t('calendar.previousMonth')" @click="monthOffset--">
          <ChevronLeft :size="17" aria-hidden="true" />
        </AppIconButton>
        <span class="text-small font-semibold" aria-live="polite">{{ monthLabel }}</span>
        <AppIconButton
          size="sm"
          :label="t('calendar.nextMonth')"
          :disabled="!canGoNext"
          @click="monthOffset++"
        >
          <ChevronRight :size="17" aria-hidden="true" />
        </AppIconButton>
      </div>
      <div class="grid grid-cols-7 gap-x-0.5 gap-y-1">
        <span
          v-for="weekday in weekdays"
          :key="weekday"
          aria-hidden="true"
          class="pb-1 text-center text-meta text-fg-subtle"
        >
          {{ weekday }}
        </span>
        <template v-for="(day, index) in days" :key="index">
          <button
            v-if="day"
            type="button"
            :aria-label="day.label"
            :aria-pressed="day.selected"
            :aria-current="day.today ? 'date' : undefined"
            :disabled="day.future || day.range === null"
            class="aspect-square w-10 max-w-full cursor-pointer rounded-full text-small font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:w-11"
            :class="{
              'bg-primary text-white focus-visible:outline-white': day.selected,
              'border-2 border-primary text-primary': day.today && !day.selected,
              'border border-line-strong text-fg enabled:hover:bg-surface-active':
                !day.today && !day.selected,
            }"
            @click="day.range && choose(day.range)"
          >
            {{ day.number }}
          </button>
          <span v-else aria-hidden="true"></span>
        </template>
      </div>
    </div>
  </div>
</template>
