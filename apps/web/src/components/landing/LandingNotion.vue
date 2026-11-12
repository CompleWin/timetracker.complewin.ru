<script setup lang="ts">
import { ChevronDown, Timer } from "@lucide/vue";
import {
  formatDateTime,
  formatDuration,
  formatSessionRange,
  formatShortDate,
  t as translate,
  type MessageKey,
} from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../../i18n.ts";
import NotionMark from "../ui/NotionMark.vue";

type LogEntry = { startedAt: string; endedAt: string; note: MessageKey; current: boolean };

const TIME_ZONE = "UTC";
const UPDATED_AT = "2026-11-03T15:52:00.000Z";
const LOG: LogEntry[] = [
  {
    startedAt: "2026-10-30T10:00:00.000Z",
    endedAt: "2026-10-30T10:40:00.000Z",
    note: "demo.log.gatheredData",
    current: false,
  },
  {
    startedAt: "2026-11-02T16:10:00.000Z",
    endedAt: "2026-11-02T17:05:00.000Z",
    note: "demo.log.draft",
    current: false,
  },
  {
    startedAt: "2026-11-03T15:02:00.000Z",
    endedAt: "2026-11-03T15:52:00.000Z",
    note: "demo.episode.0.note",
    current: true,
  },
];

const { t } = useI18n();

const totalSec = LOG.reduce(
  (sum, entry) => sum + (Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000,
  0,
);

const total = computed(() => formatDuration(totalSec, currentLocale()));

const summary = computed(() => {
  const locale = currentLocale();
  return translate(locale, "notion.block.summary", {
    total: total.value,
    count: LOG.length,
    updated: formatDateTime(UPDATED_AT, TIME_ZONE, locale),
  });
});

const lines = computed(() => {
  const locale = currentLocale();
  return LOG.map((entry) => ({
    key: entry.startedAt,
    current: entry.current,
    text:
      translate(locale, "notion.block.lineWithNote", {
        date: formatShortDate(entry.startedAt, TIME_ZONE, locale),
        range: formatSessionRange(entry.startedAt, entry.endedAt, TIME_ZONE, locale),
        duration: formatDuration(
          (Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000,
          locale,
        ),
      }) + translate(locale, entry.note),
  }));
});
</script>

<template>
  <section
    id="notion"
    class="mx-auto max-w-(--content-max) px-[clamp(16px,3vw,32px)] py-6"
    aria-labelledby="notion-title"
  >
    <div
      class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-[clamp(24px,4vw,48px)] rounded-[28px] border border-line bg-surface-island p-[clamp(20px,4vw,40px)]"
    >
      <div>
        <h2
          id="notion-title"
          class="mt-4 text-[clamp(28px,3.4vw,40px)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance"
        >
          {{ t("guest.notion.title") }}
        </h2>
        <p class="mt-3.5 max-w-[480px] text-input leading-[1.6] text-fg-muted">
          {{ t("guest.notion.text") }}
        </p>
      </div>
      <div aria-hidden="true" class="rounded-island bg-surface-page p-[clamp(16px,3vw,28px)]">
        <div
          class="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface-island px-3 text-small whitespace-nowrap"
        >
          <NotionMark />
          {{ t("guest.notion.page") }}
        </div>
        <div class="mt-2 rounded-island border border-line bg-surface-island px-5 pt-[18px] pb-5">
          <p class="text-title leading-[1.3]">{{ t("demo.task.monthlyReport") }}</p>
          <p class="mt-2 flex items-baseline gap-3 text-meta">
            <span class="w-[52px] flex-none text-fg-subtle">{{
              t("guest.notion.timeProperty")
            }}</span>
            <span class="font-code text-fg">{{ total }}</span>
          </p>
          <p class="mt-3 flex gap-2 rounded-field bg-surface-page px-3 py-2.5 text-meta text-fg">
            <Timer :size="15" class="mt-0.5 flex-none text-fg-subtle" />
            <span>{{ summary }}</span>
          </p>
          <p class="mt-3 flex items-center gap-1.5 text-meta font-semibold">
            <ChevronDown :size="14" class="flex-none text-fg-subtle" />
            {{ t("notion.block.log") }}
          </p>
          <ul class="mt-0.5 flex flex-col gap-0.5 pl-5 text-meta text-fg-muted">
            <li
              v-for="line in lines"
              :key="line.key"
              class="list-inside list-disc rounded-[6px] py-px pr-1.5"
              :class="{ 'bg-primary-soft text-primary-ink': line.current }"
            >
              {{ line.text }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
