<script setup lang="ts">
import { Archive, Pencil } from "@lucide/vue";
import { tc, type Project, type SessionWithTask, type Task } from "@stt/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n.ts";
import type { ProjectBranch } from "../task-picker.ts";
import TaskListRow from "./TaskListRow.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppMenu, { type MenuItem } from "./ui/AppMenu.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const props = defineProps<{
  branch: ProjectBranch;
  selectedIds: ReadonlySet<string>;
  running: Map<string, SessionWithTask>;
  now: number;
  timeZone: string | null;
}>();
const emit = defineEmits<{
  toggle: [task: Task];
  edit: [task: Task];
  archive: [task: Task];
  editProject: [project: Project];
  archiveProject: [project: Project];
}>();

const { t } = useI18n();

const name = computed(() => props.branch.project?.name ?? t("home.noProject"));
const count = computed(() => tc(currentLocale(), "tasksPage.count", props.branch.tasks.length));

function projectMenu(project: Project): MenuItem[] {
  return [
    { label: t("projects.rename"), icon: Pencil, select: () => emit("editProject", project) },
    { label: t("actions.archive"), icon: Archive, select: () => emit("archiveProject", project) },
  ];
}
</script>

<template>
  <AppIsland padding="none" class="overflow-hidden">
    <div class="flex items-center gap-2 px-4 pt-4 pb-3 md:px-6">
      <h2 class="flex min-w-0 items-center gap-2 text-title break-words">
        <ProjectMarker v-if="branch.project" :color="branch.project.color" />
        <span class="min-w-0">{{ name }}</span>
      </h2>
      <span class="flex-none text-meta text-fg-faint">{{ count }}</span>
      <AppMenu
        v-if="branch.project"
        class="-mr-2 ml-auto"
        :label="t('projects.actions', { name: branch.project.name })"
        :items="projectMenu(branch.project)"
        size="toolbar"
      />
    </div>
    <TaskListRow
      v-for="task in branch.tasks"
      :key="task.id"
      :task
      :selected="selectedIds.has(task.id)"
      :running="running.get(task.id)"
      :now
      :time-zone
      @toggle="emit('toggle', task)"
      @edit="emit('edit', task)"
      @archive="emit('archive', task)"
    />
    <p v-if="branch.tasks.length === 0" class="px-4 pb-4 text-small text-fg-subtle md:px-6">
      {{ t("picker.emptyProject") }}
    </p>
  </AppIsland>
</template>
