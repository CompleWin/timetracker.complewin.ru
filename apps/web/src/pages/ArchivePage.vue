<script setup lang="ts">
import type { Project, Task } from "@stt/shared";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import ArchiveList from "../components/ArchiveList.vue";
import AppFormError from "../components/ui/AppFormError.vue";
import ProjectMarker from "../components/ui/ProjectMarker.vue";

const { t } = useI18n();
const projects = ref<Project[]>([]);
const tasks = ref<Task[]>([]);
const loaded = ref(false);
const nameTaken = ref(false);

onMounted(reload);

async function reload(): Promise<void> {
  const [archivedProjects, inactiveTasks] = await Promise.all([
    api.fetchProjects("true"),
    api.fetchTasks("true"),
  ]);
  projects.value = archivedProjects;
  tasks.value = inactiveTasks.filter((task) => task.archived);
  loaded.value = true;
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
  await reload();
}
</script>

<template>
  <ArchiveList
    :title="t('archive.projects')"
    :items="projects"
    :loaded
    :name-of="(project) => project.name"
    @restore="restoreProject"
  >
    <template #notice>
      <AppFormError v-if="nameTaken" placement="form" class="mt-4">
        {{ t("projects.nameTaken") }}
      </AppFormError>
    </template>
    <template #marker="{ item }">
      <ProjectMarker :color="item.color" />
    </template>
  </ArchiveList>
  <ArchiveList
    :title="t('archive.tasks')"
    :items="tasks"
    :loaded
    :name-of="(task) => task.title"
    @restore="restoreTask"
  />
</template>
