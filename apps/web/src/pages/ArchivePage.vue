<script setup lang="ts">
import { formatDate, tc, type Project, type Task } from "@stt/shared";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import ArchiveList from "../components/ArchiveList.vue";
import ArchiveRow from "../components/ArchiveRow.vue";
import AppFormError from "../components/ui/AppFormError.vue";
import { currentLocale } from "../i18n.ts";
import { joinMeta } from "../meta-line.ts";
import { useSessionStore } from "../stores/session.ts";

type Archivable = { archivedAt: string | null };

const { t } = useI18n();
const account = useSessionStore();
const projects = ref<Project[]>([]);
const inactiveTasks = ref<Task[]>([]);
const loaded = ref(false);
const nameTaken = ref(false);

const timeZone = computed(() => account.user?.timezone ?? null);
const projectsById = computed(
  () => new Map(projects.value.map((project) => [project.id, project])),
);
const archivedProjects = computed(() =>
  latestArchivedFirst(projects.value.filter((project) => project.archived)),
);
const archivedTasks = computed(() =>
  latestArchivedFirst(inactiveTasks.value.filter((task) => task.archived)),
);

onMounted(reload);
useAutoRefresh(reload);

async function reload(): Promise<void> {
  const [allProjects, tasks] = await Promise.all([
    api.fetchProjects("all"),
    api.fetchTasks("true"),
  ]);
  projects.value = allProjects;
  inactiveTasks.value = tasks;
  loaded.value = true;
}

function latestArchivedFirst<Item extends Archivable>(items: Item[]): Item[] {
  return items.toSorted((a, b) => archivedMs(b) - archivedMs(a));
}

function archivedMs({ archivedAt }: Archivable): number {
  return archivedAt === null ? 0 : Date.parse(archivedAt);
}

function archivedSince({ archivedAt }: Archivable): string[] {
  if (archivedAt === null) return [];
  return [t("archive.since", { date: formatDate(archivedAt, timeZone.value, currentLocale()) })];
}

function projectMeta(project: Project): string {
  const locale = currentLocale();
  const returning = inactiveTasks.value.filter(
    (task) => task.projectId === project.id && !task.archived,
  ).length;
  const returningPart = returning === 0 ? [] : [tc(locale, "archive.tasksReturn", returning)];
  return joinMeta(locale, [...returningPart, ...archivedSince(project)]);
}

function taskProject(task: Task): Project | null {
  return projectsById.value.get(task.projectId ?? "") ?? null;
}

function taskMeta(task: Task): string {
  const projectName = taskProject(task)?.name ?? t("home.noProject");
  return joinMeta(currentLocale(), [projectName, ...archivedSince(task)]);
}

async function restoreProject(project: Project): Promise<void> {
  nameTaken.value = false;
  try {
    await api.updateProject(project.id, { archived: false });
  } catch (error) {
    if (!api.isApiError(error, "name_taken")) throw error;
    nameTaken.value = true;
  }
  await reload();
}

async function restoreTask(task: Task): Promise<void> {
  await api.updateTask(task.id, { archived: false });
  nameTaken.value = false;
  await reload();
}
</script>

<template>
  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h1 class="text-h2">{{ t("header.archive") }}</h1>
    <p class="text-small text-fg-subtle">{{ t("archive.hint") }}</p>
  </div>
  <ArchiveList
    :title="t('archive.projects')"
    :count="archivedProjects.length"
    :loaded
    :empty="t('archive.noProjects')"
  >
    <template #notice>
      <AppFormError
        v-if="nameTaken"
        placement="form"
        dismissible
        class="mb-3"
        @dismiss="nameTaken = false"
      >
        {{ t("projects.nameTaken") }}
      </AppFormError>
    </template>
    <ArchiveRow
      v-for="project in archivedProjects"
      :key="project.id"
      :name="project.name"
      :total-sec="project.totalSec"
      :meta="projectMeta(project)"
      :color="project.color"
      marker-at="name"
      @restore="restoreProject(project)"
    />
  </ArchiveList>
  <ArchiveList
    :title="t('archive.tasks')"
    :count="archivedTasks.length"
    :loaded
    :empty="t('archive.noTasks')"
  >
    <ArchiveRow
      v-for="task in archivedTasks"
      :key="task.id"
      :name="task.title"
      :total-sec="task.totalSec"
      :meta="taskMeta(task)"
      :color="taskProject(task)?.color ?? null"
      marker-at="meta"
      @restore="restoreTask(task)"
    />
  </ArchiveList>
</template>
