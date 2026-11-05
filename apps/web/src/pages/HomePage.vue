<script setup lang="ts">
import { lastDays, type Project, type SessionWithTask, type Task } from "@stt/shared";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import LaunchIsland from "../components/LaunchIsland.vue";
import ProjectDialog from "../components/ProjectDialog.vue";
import SessionDialog, {
  type SessionRange,
  type SessionTask,
  type TaskChoice,
} from "../components/SessionDialog.vue";
import SummaryIsland from "../components/SummaryIsland.vue";
import TaskDialog from "../components/TaskDialog.vue";
import type { NewTaskRequest } from "../components/TaskPicker.vue";
import TimelineIsland from "../components/TimelineIsland.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import AppSkeleton from "../components/ui/AppSkeleton.vue";
import { secondsByTask, startedIn } from "../day-sessions.ts";
import { serverNowMs, useServerNow } from "../server-clock.ts";
import { useSessionStore } from "../stores/session.ts";
import { recentTasks } from "../task-picker.ts";
import { changeTimer } from "../timers.ts";

type OpenDialog =
  | { kind: "newSession"; range?: SessionRange }
  | { kind: "session"; session: SessionWithTask }
  | { kind: "project"; project?: Project }
  | { kind: "task" };

const WEEK_DAYS = 7;
const MS_PER_MINUTE = 60_000;

const { t } = useI18n();
const account = useSessionStore();
const projects = ref<Project[]>([]);
const tasks = ref<Task[]>([]);
const running = ref<SessionWithTask[]>([]);
const weekSessions = ref<SessionWithTask[]>([]);
const loaded = ref(false);
const dialog = ref<OpenDialog | null>(null);
const now = useServerNow();
let latestReload = 0;

const timeZone = computed(() => account.user?.timezone ?? null);
const currentMinute = computed(() => Math.floor(now.value / MS_PER_MINUTE));
const days = computed(() => weekOf(currentMinute.value * MS_PER_MINUTE));
const today = computed(() => days.value[days.value.length - 1]);
const todaySessions = computed(() =>
  today.value === undefined ? [] : startedIn(today.value, weekSessions.value),
);
const todaySecByTask = computed(() => secondsByTask(todaySessions.value, now.value));
const projectsById = computed(
  () => new Map(projects.value.map((project) => [project.id, project])),
);
const activeProjects = computed(() => projects.value.filter((project) => !project.archived));

const taskChoices = computed<TaskChoice[]>(() =>
  tasks.value.map((task) => {
    const project = projectsById.value.get(task.projectId ?? "");
    return {
      id: task.id,
      label:
        project === undefined
          ? task.title
          : t("sessions.taskOption", { title: task.title, project: project.name }),
    };
  }),
);
const lastStartedTaskId = computed(() => recentTasks(tasks.value)[0]?.id ?? null);

onMounted(reload);
useAutoRefresh(reload);
watch(timeZone, reload);

function weekOf(epochMs: number) {
  return lastDays(new Date(epochMs).toISOString(), timeZone.value, WEEK_DAYS);
}

async function reload(): Promise<void> {
  const reloadNumber = ++latestReload;
  const week = weekOf(serverNowMs());
  const from = week[0]?.from ?? "";
  const to = week[week.length - 1]?.to ?? "";
  const loadedData = await Promise.all([
    api.fetchProjects("all"),
    api.fetchTasks("false"),
    api.fetchActiveSessions(),
    api.fetchPeriodSessions(from, to),
  ]);
  if (reloadNumber !== latestReload) return;
  [projects.value, tasks.value, running.value, weekSessions.value] = loadedData;
  loaded.value = true;
}

async function changeAndReload(change: () => Promise<unknown>): Promise<void> {
  await change();
  await reload();
}

function startTask(task: Task): Promise<void> {
  return changeAndReload(() => changeTimer(() => api.startTimer(task.id)));
}

function createAndStart({ title, projectId }: NewTaskRequest): Promise<void> {
  return changeAndReload(async () => {
    const task = await api.createTask({ title, projectId });
    await changeTimer(() => api.startTimer(task.id));
  });
}

function togglePin(task: Task): Promise<void> {
  const pinned = !task.pinned;
  tasks.value = tasks.value.map((item) => (item.id === task.id ? { ...item, pinned } : item));
  return changeAndReload(() => api.updateTask(task.id, { pinned }));
}

function stopSession(session: SessionWithTask): Promise<void> {
  return changeAndReload(() => changeTimer(() => api.stopSession(session.id)));
}

function stopAll(): Promise<void> {
  const sessions = running.value;
  return changeAndReload(() =>
    Promise.all(sessions.map((session) => changeTimer(() => api.stopSession(session.id)))),
  );
}

function archiveProject(project: Project): Promise<void> {
  return changeAndReload(() => api.updateProject(project.id, { archived: true }));
}

function sessionTask(session: SessionWithTask): SessionTask {
  return {
    id: session.task.id,
    title: session.task.title,
    project: projectsById.value.get(session.task.projectId ?? "") ?? null,
  };
}

async function openDialog(next: OpenDialog): Promise<void> {
  await nextTick();
  dialog.value = next;
}

async function onSaved(): Promise<void> {
  dialog.value = null;
  await reload();
}
</script>

<template>
  <AppIsland v-if="!loaded">
    <AppSkeleton />
  </AppIsland>
  <template v-else>
    <LaunchIsland
      :tasks
      :projects
      :running
      :today-sec="todaySecByTask"
      :now
      :time-zone
      @start="startTask"
      @create="createAndStart"
      @pin="togglePin"
      @stop="stopSession"
      @stop-all="stopAll"
      @add-manually="openDialog({ kind: 'newSession' })"
      @new-task="openDialog({ kind: 'task' })"
      @new-project="openDialog({ kind: 'project' })"
      @edit-project="(project) => openDialog({ kind: 'project', project })"
      @archive-project="archiveProject"
    />
    <TimelineIsland
      v-if="today"
      :sessions="todaySessions"
      :day="today"
      :projects="projectsById"
      :now
      :time-zone
      @add="openDialog({ kind: 'newSession' })"
      @fill="(range) => openDialog({ kind: 'newSession', range })"
      @edit="(session) => openDialog({ kind: 'session', session })"
    />
    <SummaryIsland :week-sessions :days :projects :now :time-zone />
  </template>

  <SessionDialog
    v-if="dialog?.kind === 'newSession'"
    :time-zone
    :choices="taskChoices"
    :chosen-task-id="lastStartedTaskId"
    :range="dialog.range"
    @close="dialog = null"
    @saved="onSaved"
  />
  <SessionDialog
    v-if="dialog?.kind === 'session'"
    :time-zone
    :session="dialog.session"
    :task="sessionTask(dialog.session)"
    link-to-task
    @close="dialog = null"
    @saved="onSaved"
  />
  <ProjectDialog
    v-if="dialog?.kind === 'project'"
    :project="dialog.project"
    @close="dialog = null"
    @saved="onSaved"
  />
  <TaskDialog
    v-if="dialog?.kind === 'task'"
    :projects="activeProjects"
    @close="dialog = null"
    @saved="onSaved"
  />
</template>
