<script setup lang="ts">
import { Archive, Pencil, Plus } from "@lucide/vue";
import type { Project, Task } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppMenu, { type MenuItem } from "./ui/AppMenu.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const props = defineProps<{ project: Project | null; tasks: Task[] }>();
const emit = defineEmits<{
  addTask: [project: Project];
  editProject: [project: Project];
  archiveProject: [project: Project];
  editTask: [task: Task];
  archiveTask: [task: Task];
}>();

const { t } = useI18n();

function projectMenu(project: Project): MenuItem[] {
  return [
    { label: t("projects.rename"), icon: Pencil, select: () => emit("editProject", project) },
    { label: t("actions.archive"), icon: Archive, select: () => emit("archiveProject", project) },
  ];
}

function taskMenu(task: Task): MenuItem[] {
  return [
    { label: t("tasks.editAction"), icon: Pencil, select: () => emit("editTask", task) },
    { label: t("actions.archive"), icon: Archive, select: () => emit("archiveTask", task) },
  ];
}

const heading = computed(() => props.project?.name ?? t("home.noProject"));
</script>

<template>
  <AppIsland as="section">
    <div class="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <ProjectMarker v-if="project" :color="project.color" />
        <h2 class="min-w-0 text-title break-words">{{ heading }}</h2>
      </div>
      <div v-if="project" class="flex items-center justify-between gap-1 max-md:-ml-3">
        <AppButton variant="ghost" size="sm" @click="emit('addTask', project)">
          <Plus :size="17" aria-hidden="true" />
          {{ t("tasks.add") }}
        </AppButton>
        <AppMenu
          :label="t('projects.actions', { name: project.name })"
          :items="projectMenu(project)"
        />
      </div>
    </div>
    <ul v-if="tasks.length > 0" class="mt-2">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="flex items-center gap-3 border-b border-line py-3.5 last:border-0"
      >
        <span class="min-w-0 flex-1 text-body break-words text-fg">{{ task.title }}</span>
        <AppMenu :label="t('tasks.actions', { title: task.title })" :items="taskMenu(task)" />
      </li>
    </ul>
  </AppIsland>
</template>
