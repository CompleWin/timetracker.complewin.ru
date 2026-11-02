<script setup lang="ts">
import type { ActiveSession, Project, Task } from "@stt/shared";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import ProjectDialog from "../components/ProjectDialog.vue";
import RunningTimers from "../components/RunningTimers.vue";
import TaskDialog from "../components/TaskDialog.vue";
import TaskGroup from "../components/TaskGroup.vue";
import AppButton from "../components/ui/AppButton.vue";
import AppEmptyState from "../components/ui/AppEmptyState.vue";
import AppField from "../components/ui/AppField.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import AppSkeleton from "../components/ui/AppSkeleton.vue";
import { useServerNow } from "../server-clock.ts";
import { groupTasks } from "../task-groups.ts";
import { changeTimer, sessionsByTask } from "../timers.ts";

type OpenDialog =
  { kind: "project"; project?: Project } | { kind: "task"; task?: Task; projectId?: string };

const { t } = useI18n();
const projects = ref<Project[]>([]);
const tasks = ref<Task[]>([]);
const activeSessions = ref<ActiveSession[]>([]);
const loaded = ref(false);
const search = ref("");
const dialog = ref<OpenDialog | null>(null);
const now = useServerNow();

const groups = computed(() => groupTasks(projects.value, tasks.value, search.value));
const runningByTask = computed(() => sessionsByTask(activeSessions.value));

onMounted(reload);

async function reload(): Promise<void> {
  [projects.value, tasks.value, activeSessions.value] = await Promise.all([
    api.fetchProjects("false"),
    api.fetchTasks("false"),
    api.fetchActiveSessions(),
  ]);
  loaded.value = true;
}

async function changeTimerAndReload(change: () => Promise<unknown>): Promise<void> {
  await changeTimer(change);
  await reload();
}

async function archiveProject(project: Project): Promise<void> {
  await api.updateProject(project.id, { archived: true });
  await reload();
}

async function archiveTask(task: Task): Promise<void> {
  await api.updateTask(task.id, { archived: true });
  await reload();
}

async function onSaved(): Promise<void> {
  dialog.value = null;
  await reload();
}
</script>

<template>
  <AppIsland compact class="flex flex-col gap-3 md:flex-row md:items-end">
    <AppField v-model="search" kind="search" :label="t('home.search')" class="md:flex-1" />
    <div class="flex flex-wrap gap-3">
      <AppButton @click="dialog = { kind: 'task' }">{{ t("tasks.new") }}</AppButton>
      <AppButton variant="outline-primary" @click="dialog = { kind: 'project' }">
        {{ t("projects.new") }}
      </AppButton>
    </div>
  </AppIsland>

  <AppIsland v-if="!loaded">
    <AppSkeleton />
  </AppIsland>
  <template v-else>
    <RunningTimers
      v-if="activeSessions.length > 0"
      :sessions="activeSessions"
      :now
      @stop="(taskId) => changeTimerAndReload(() => api.stopTimer(taskId))"
    />
    <TaskGroup
      v-for="group in groups"
      :key="group.project?.id ?? 'none'"
      :project="group.project"
      :tasks="group.tasks"
      :running="runningByTask"
      :now
      @add-task="(project) => (dialog = { kind: 'task', projectId: project.id })"
      @edit-project="(project) => (dialog = { kind: 'project', project })"
      @archive-project="archiveProject"
      @edit-task="(task) => (dialog = { kind: 'task', task })"
      @archive-task="archiveTask"
      @start-timer="(task) => changeTimerAndReload(() => api.startTimer(task.id))"
      @stop-timer="(task) => changeTimerAndReload(() => api.stopTimer(task.id))"
    />
    <AppEmptyState v-if="tasks.length === 0" :title="t('home.empty')" />
  </template>

  <ProjectDialog
    v-if="dialog?.kind === 'project'"
    :project="dialog.project"
    @close="dialog = null"
    @saved="onSaved"
  />
  <TaskDialog
    v-if="dialog?.kind === 'task'"
    :projects
    :task="dialog.task"
    :project-id="dialog.projectId"
    @close="dialog = null"
    @saved="onSaved"
  />
</template>
