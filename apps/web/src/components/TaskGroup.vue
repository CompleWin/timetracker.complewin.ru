<script setup lang="ts">
import { Archive, Pencil, Plus } from "@lucide/vue";
import { formatDuration, type ActiveSession, type Project, type Task } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import { liveTotalSec } from "../timers.ts";
import TaskRow from "./TaskRow.vue";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppMenu, { type MenuItem } from "./ui/AppMenu.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const props = defineProps<{
  project: Project | null;
  tasks: Task[];
  running: Map<string, ActiveSession>;
  now: number;
}>();
const emit = defineEmits<{
  addTask: [project: Project];
  editProject: [project: Project];
  archiveProject: [project: Project];
  editTask: [task: Task];
  archiveTask: [task: Task];
  startTimer: [task: Task];
  stopTimer: [task: Task];
}>();

const { t } = useI18n();

function projectMenu(project: Project): MenuItem[] {
  return [
    { label: t("projects.rename"), icon: Pencil, select: () => emit("editProject", project) },
    { label: t("actions.archive"), icon: Archive, select: () => emit("archiveProject", project) },
  ];
}

function projectTotal(project: Project): string {
  const running = [...props.running.values()].filter(
    (session) => session.task.projectId === project.id,
  );
  return formatDuration(liveTotalSec(project.totalSec, running, props.now), currentLocale());
}

const heading = computed(() => props.project?.name ?? t("home.noProject"));
</script>

<template>
  <AppIsland as="section">
    <div class="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <ProjectMarker v-if="project" :color="project.color" />
        <h2 class="min-w-0 text-title break-words">{{ heading }}</h2>
        <span v-if="project" class="font-code text-meta text-fg-subtle">
          {{ projectTotal(project) }}
        </span>
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
      <TaskRow
        v-for="task in tasks"
        :key="task.id"
        :task
        :running="running.get(task.id)"
        :now
        @edit="emit('editTask', task)"
        @archive="emit('archiveTask', task)"
        @start="emit('startTimer', task)"
        @stop="emit('stopTimer', task)"
      />
    </ul>
  </AppIsland>
</template>
