<script setup lang="ts">
import { Plus } from "@lucide/vue";
import { formatDuration, type Project, type Session, type Task } from "@stt/shared";
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import SessionDialog from "../components/SessionDialog.vue";
import SessionRow from "../components/SessionRow.vue";
import TimerButton from "../components/TimerButton.vue";
import AppButton from "../components/ui/AppButton.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import AppSectionLabel from "../components/ui/AppSectionLabel.vue";
import AppSkeleton from "../components/ui/AppSkeleton.vue";
import ProjectMarker from "../components/ui/ProjectMarker.vue";
import { currentLocale } from "../i18n.ts";
import { useServerNow } from "../server-clock.ts";
import { useSessionStore } from "../stores/session.ts";
import { changeTimer, liveTotalSec } from "../timers.ts";

type OpenDialog = { session?: Session };

const NOT_FOUND_STATUS = 404;

const props = defineProps<{ id: string }>();

const { t } = useI18n();
const router = useRouter();
const account = useSessionStore();
const task = ref<Task | null>(null);
const project = ref<Project | null>(null);
const sessions = ref<Session[]>([]);
const dialog = ref<OpenDialog | null>(null);
const now = useServerNow();
const sessionsHeadingId = useId();

const timeZone = computed(() => account.user?.timezone ?? null);

const isActive = computed(
  () => task.value !== null && !task.value.archived && project.value?.archived !== true,
);

const total = computed(() => {
  const running = sessions.value.filter((session) => session.endedAt === null);
  const totalSec = liveTotalSec(task.value?.totalSec ?? 0, running, now.value);
  return t("tasks.total", { duration: formatDuration(totalSec, currentLocale()) });
});

watch(() => props.id, load, { immediate: true });
useAutoRefresh(load);

async function load(): Promise<void> {
  try {
    const [loadedTask, loadedSessions] = await Promise.all([
      api.fetchTask(props.id),
      api.fetchTaskSessions(props.id),
    ]);
    project.value =
      loadedTask.projectId === null ? null : await api.fetchProject(loadedTask.projectId);
    sessions.value = loadedSessions;
    task.value = loadedTask;
  } catch (error) {
    if (!(error instanceof api.HttpError && error.status === NOT_FOUND_STATUS)) throw error;
    await router.replace("/");
  }
}

async function changeTimerAndReload(change: () => Promise<unknown>): Promise<void> {
  await changeTimer(change);
  await load();
}

async function onSaved(): Promise<void> {
  dialog.value = null;
  await load();
}
</script>

<template>
  <AppIsland v-if="task === null">
    <AppSkeleton />
  </AppIsland>
  <template v-else>
    <AppIsland>
      <div class="flex items-center gap-2">
        <ProjectMarker v-if="project" :color="project.color" />
        <AppSectionLabel class="min-w-0 break-words">
          {{ project?.name ?? t("home.noProject") }}
        </AppSectionLabel>
      </div>
      <h1 class="mt-3 text-h1 break-words md:text-h1-lg">{{ task.title }}</h1>
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <span
          class="inline-flex h-8 items-center rounded-full bg-primary-soft px-3.5 text-meta text-primary-ink"
        >
          {{ total }}
        </span>
        <TimerButton
          v-if="isActive"
          :title="task.title"
          :running="task.runningSessionId !== null"
          prominent
          @start="changeTimerAndReload(() => api.startTimer(props.id))"
          @stop="changeTimerAndReload(() => api.stopTimer(props.id))"
        />
      </div>
    </AppIsland>

    <AppIsland as="section" :aria-labelledby="sessionsHeadingId">
      <div class="flex items-center justify-between gap-3">
        <h2 :id="sessionsHeadingId" class="text-title">{{ t("sessions.title") }}</h2>
        <AppButton v-if="isActive" variant="outline-primary" size="sm" @click="dialog = {}">
          <Plus :size="17" aria-hidden="true" />
          {{ t("sessions.add") }}
        </AppButton>
      </div>
      <ul v-if="sessions.length > 0" class="mt-2">
        <SessionRow
          v-for="session in sessions"
          :key="session.id"
          :session
          :time-zone
          :now
          @edit="dialog = { session }"
        />
      </ul>
    </AppIsland>

    <SessionDialog
      v-if="dialog"
      :task-id="task.id"
      :session="dialog.session"
      :time-zone
      @close="dialog = null"
      @saved="onSaved"
    />
  </template>
</template>
