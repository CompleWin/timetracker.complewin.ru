<script setup lang="ts">
import { ChevronLeft } from "@lucide/vue";
import { lastDays, type Project, type Session, type SessionWithTask, type Task } from "@stt/shared";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import SessionDialog from "../components/SessionDialog.vue";
import TaskDays from "../components/TaskDays.vue";
import TaskDialog from "../components/TaskDialog.vue";
import TaskOverview from "../components/TaskOverview.vue";
import TaskSessions from "../components/TaskSessions.vue";
import AppButton from "../components/ui/AppButton.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import AppSkeleton from "../components/ui/AppSkeleton.vue";
import { startedIn } from "../day-sessions.ts";
import { serverNowMs, useServerNow } from "../server-clock.ts";
import { useSessionStore } from "../stores/session.ts";
import { changeTimer } from "../timers.ts";

type OpenDialog = { kind: "session"; session?: Session } | { kind: "task"; projects: Project[] };

type TaskPageData = {
  task: Task;
  project: Project | null;
  sessions: Session[];
  periodSessions: SessionWithTask[];
};

const NOT_FOUND_STATUS = 404;
const PERIOD_DAYS = 14;
const MS_PER_MINUTE = 60_000;

const props = defineProps<{ id: string }>();

const { t } = useI18n();
const router = useRouter();
const account = useSessionStore();
const data = ref<TaskPageData | null>(null);
const dialog = ref<OpenDialog | null>(null);
const now = useServerNow();
let latestLoad = 0;

const timeZone = computed(() => account.user?.timezone ?? null);
const currentMinute = computed(() => Math.floor(now.value / MS_PER_MINUTE));
const days = computed(() => periodOf(currentMinute.value * MS_PER_MINUTE));

const task = computed(() => data.value?.task ?? null);
const project = computed(() => data.value?.project ?? null);
const sessions = computed(() => data.value?.sessions ?? []);
const periodSessions = computed(() => data.value?.periodSessions ?? []);

const taskArchived = computed(() => task.value?.archived === true);
const projectArchived = computed(() => project.value?.archived === true);
const isActive = computed(() => !taskArchived.value && !projectArchived.value);

const running = computed(() =>
  sessions.value.find((session) => session.id === task.value?.runningSessionId),
);
const todaySessions = computed(() => {
  const today = days.value.at(-1);
  return today === undefined ? [] : startedIn(today, periodSessions.value);
});

const sessionTask = computed(() =>
  task.value === null
    ? undefined
    : { id: task.value.id, title: task.value.title, project: project.value },
);

watch(() => props.id, load, { immediate: true });
watch(timeZone, load);
useAutoRefresh(load);

function periodOf(epochMs: number) {
  return lastDays(new Date(epochMs).toISOString(), timeZone.value, PERIOD_DAYS);
}

async function load(): Promise<void> {
  const loadNumber = ++latestLoad;
  try {
    const loaded = await fetchPageData(props.id);
    if (loadNumber === latestLoad) data.value = loaded;
  } catch (error) {
    if (!(error instanceof api.HttpError && error.status === NOT_FOUND_STATUS)) throw error;
    await router.replace("/");
  }
}

async function fetchPageData(id: string): Promise<TaskPageData> {
  const period = periodOf(serverNowMs());
  const from = period[0]?.from ?? "";
  const to = period[period.length - 1]?.to ?? "";
  const [loadedTask, loadedSessions, loadedPeriodSessions] = await Promise.all([
    api.fetchTask(id),
    api.fetchTaskSessions(id),
    api.fetchPeriodSessions(from, to, id),
  ]);
  const loadedProject =
    loadedTask.projectId === null ? null : await api.fetchProject(loadedTask.projectId);
  return {
    task: loadedTask,
    project: loadedProject,
    sessions: loadedSessions,
    periodSessions: loadedPeriodSessions,
  };
}

async function changeAndReload(change: () => Promise<unknown>): Promise<void> {
  await change();
  await load();
}

function startTimer(): Promise<void> {
  return changeAndReload(() => changeTimer(() => api.startTimer(props.id)));
}

function stopTimer(): Promise<void> {
  return changeAndReload(() => changeTimer(() => api.stopTimer(props.id)));
}

function setArchived(archived: boolean): Promise<void> {
  return changeAndReload(() => api.updateTask(props.id, { archived }));
}

async function editTask(): Promise<void> {
  const projects = await api.fetchProjects("false");
  dialog.value = { kind: "task", projects };
}

async function onSaved(): Promise<void> {
  dialog.value = null;
  await load();
}
</script>

<template>
  <RouterLink
    to="/"
    class="inline-flex min-h-9 items-center gap-1 self-start rounded-full pr-3 pl-1.5 text-small text-fg-subtle no-underline transition-colors duration-150 hover:bg-surface-active hover:text-fg"
  >
    <ChevronLeft :size="17" aria-hidden="true" />
    {{ t("header.tracker") }}
  </RouterLink>
  <AppIsland v-if="task === null">
    <AppSkeleton />
  </AppIsland>
  <template v-else>
    <div class="flex flex-wrap items-start gap-x-4 gap-y-5">
      <div class="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
        <div
          v-if="!isActive"
          class="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-panel bg-surface-active px-4 py-3 text-small text-fg-muted"
        >
          <p class="min-w-0 flex-[1_1_260px]">
            {{ taskArchived ? t("tasks.archivedNotice") : t("tasks.projectArchivedNotice") }}
          </p>
          <AppButton
            v-if="taskArchived"
            variant="outline-primary"
            size="sm"
            class="bg-surface-island"
            @click="setArchived(false)"
          >
            {{ t("archive.restore") }}
          </AppButton>
        </div>
        <TaskOverview
          :task
          :project
          :active="isActive"
          :running
          :today-sessions="todaySessions"
          :now
          :time-zone
          @edit="editTask"
          @archive="setArchived(true)"
          @start="startTimer"
          @stop="stopTimer"
        />
        <TaskSessions
          :sessions
          :active="isActive"
          :now
          :time-zone
          @add="dialog = { kind: 'session' }"
          @edit="(session) => (dialog = { kind: 'session', session })"
        />
      </div>
      <div class="flex max-w-full min-w-0 flex-[1_1_320px] flex-col gap-5">
        <TaskDays :sessions="periodSessions" :days :now :time-zone />
      </div>
    </div>

    <SessionDialog
      v-if="dialog?.kind === 'session'"
      :task="sessionTask"
      :session="dialog.session"
      :time-zone
      @close="dialog = null"
      @saved="onSaved"
    />
    <TaskDialog
      v-if="dialog?.kind === 'task'"
      :projects="dialog.projects"
      :task
      @close="dialog = null"
      @saved="onSaved"
    />
  </template>
</template>
