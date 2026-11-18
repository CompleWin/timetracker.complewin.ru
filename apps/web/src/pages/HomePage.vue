<script setup lang="ts">
import {
  lastDays,
  type HiddenGap,
  type NotionDatabase,
  type Project,
  type SessionWithTask,
  type Task,
} from "@stt/shared";
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import LaunchIsland from "../components/LaunchIsland.vue";
import NotionPagesDialog from "../components/NotionPagesDialog.vue";
import ProjectDialog from "../components/ProjectDialog.vue";
import SessionDialog, {
  type SessionRange,
  type SessionTask,
} from "../components/SessionDialog.vue";
import SummaryIsland from "../components/SummaryIsland.vue";
import TaskDeleteDialog from "../components/TaskDeleteDialog.vue";
import TaskDialog from "../components/TaskDialog.vue";
import type { NewTaskRequest } from "../components/TaskPicker.vue";
import TimelineIsland from "../components/TimelineIsland.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import AppSkeleton from "../components/ui/AppSkeleton.vue";
import { isOnline } from "../connection.ts";
import { secondsByTask, startedIn } from "../day-sessions.ts";
import { serverNowMs, useServerNow } from "../server-clock.ts";
import { useSessionStore } from "../stores/session.ts";
import { recentTasks } from "../task-picker.ts";
import { changeTimer } from "../timers.ts";

type OpenDialog =
  | { kind: "newSession"; range?: SessionRange }
  | { kind: "session"; session: SessionWithTask }
  | { kind: "project"; project?: Project }
  | { kind: "task"; task?: Task }
  | { kind: "deleteTask"; task: Task }
  | { kind: "notionPages" };

const WEEK_DAYS = 7;
const MS_PER_MINUTE = 60_000;

const account = useSessionStore();
const projects = ref<Project[]>([]);
const tasks = ref<Task[]>([]);
const running = ref<SessionWithTask[]>([]);
const weekSessions = ref<SessionWithTask[]>([]);
const hiddenGaps = shallowRef<HiddenGap[]>([]);
const pendingHiddenGaps = shallowRef<HiddenGap[]>([]);
const notionDatabases = ref<NotionDatabase[]>([]);
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
const effectiveHiddenGaps = computed(() => [...hiddenGaps.value, ...pendingHiddenGaps.value]);
const projectsById = computed(
  () => new Map(projects.value.map((project) => [project.id, project])),
);
const activeProjects = computed(() => projects.value.filter((project) => !project.archived));

const lastStartedTaskId = computed(() => recentTasks(tasks.value)[0]?.id ?? null);

onMounted(reload);
onMounted(loadNotionDatabases);
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
  const gapsBeforeReload = hiddenGaps.value;
  const loadedData = await Promise.all([
    api.fetchProjects("all"),
    api.fetchTasks("false"),
    api.fetchActiveSessions(),
    api.fetchPeriodSessions(from, to),
    api.fetchHiddenGaps(from, to),
  ]);
  if (reloadNumber !== latestReload) return;
  const [nextProjects, nextTasks, nextRunning, nextSessions, nextHiddenGaps] = loadedData;
  if (hiddenGaps.value === gapsBeforeReload) hiddenGaps.value = nextHiddenGaps;
  projects.value = nextProjects;
  tasks.value = nextTasks;
  running.value = nextRunning;
  weekSessions.value = nextSessions;
  loaded.value = true;
}

async function loadNotionDatabases(): Promise<void> {
  notionDatabases.value = (await api.fetchNotionConnection())?.databases ?? [];
}

async function changeAndReload(change: () => Promise<unknown>): Promise<void> {
  await change();
  await reload();
}

async function hideGap(gap: HiddenGap): Promise<void> {
  if (!isOnline.value) return;
  pendingHiddenGaps.value = [...pendingHiddenGaps.value, gap];
  try {
    await api.hideGap(gap);
    hiddenGaps.value = [...hiddenGaps.value, gap];
  } catch (error) {
    if (!(error instanceof api.NetworkError)) throw error;
  } finally {
    pendingHiddenGaps.value = pendingHiddenGaps.value.filter((pending) => pending !== gap);
  }
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

function archiveTask(task: Task): Promise<void> {
  return changeAndReload(() => api.updateTask(task.id, { archived: true }));
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

async function onTaskDeleted(id: string): Promise<void> {
  tasks.value = tasks.value.filter((task) => task.id !== id);
  running.value = running.value.filter((session) => session.taskId !== id);
  weekSessions.value = weekSessions.value.filter((session) => session.taskId !== id);
  await onSaved();
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
      :can-add-from-notion="notionDatabases.length > 0"
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
      @edit-task="(task) => openDialog({ kind: 'task', task })"
      @delete-task="(task) => openDialog({ kind: 'deleteTask', task })"
      @archive-task="archiveTask"
      @add-from-notion="openDialog({ kind: 'notionPages' })"
    />
    <TimelineIsland
      v-if="today"
      :sessions="todaySessions"
      :day="today"
      :projects="projectsById"
      :show-gaps="account.user?.showGaps ?? true"
      :hidden-gaps="effectiveHiddenGaps"
      :now
      :time-zone
      @add="openDialog({ kind: 'newSession' })"
      @fill="(range) => openDialog({ kind: 'newSession', range })"
      @hide="hideGap"
      @edit="(session) => openDialog({ kind: 'session', session })"
    />
    <SummaryIsland :week-sessions :days :projects :now :time-zone />
  </template>

  <SessionDialog
    v-if="dialog?.kind === 'newSession'"
    :time-zone
    :task-picker="{ tasks, projects, todaySec: todaySecByTask }"
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
  <NotionPagesDialog
    v-if="dialog?.kind === 'notionPages'"
    :databases="notionDatabases"
    :projects="activeProjects"
    @close="dialog = null"
    @linked="reload"
  />
  <TaskDialog
    v-if="dialog?.kind === 'task'"
    :task="dialog.task"
    :projects="activeProjects"
    @close="dialog = null"
    @saved="onSaved"
    @created="reload"
  />
  <TaskDeleteDialog
    v-if="dialog?.kind === 'deleteTask'"
    :task="dialog.task"
    @close="dialog = null"
    @deleted="onTaskDeleted"
  />
</template>
