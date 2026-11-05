<script setup lang="ts">
import { Archive, ChevronRight, Pencil } from "@lucide/vue";
import type { Project } from "@stt/shared";
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import type { ProjectBranch } from "../task-picker.ts";
import AppMenu, { type MenuItem } from "./ui/AppMenu.vue";
import ProjectMarker from "./ui/ProjectMarker.vue";

const props = defineProps<{ branch: ProjectBranch; expanded: boolean }>();
const emit = defineEmits<{ toggle: []; editProject: [Project]; archiveProject: [Project] }>();

const { t } = useI18n();
const groupId = useId();

const name = computed(() => props.branch.project?.name ?? t("home.noProject"));

function projectMenu(project: Project): MenuItem[] {
  return [
    { label: t("projects.rename"), icon: Pencil, select: () => emit("editProject", project) },
    { label: t("actions.archive"), icon: Archive, select: () => emit("archiveProject", project) },
  ];
}
</script>

<template>
  <div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        :aria-expanded="expanded"
        :aria-controls="expanded ? groupId : undefined"
        class="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-field px-3 text-left transition-colors duration-150 hover:bg-surface-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="emit('toggle')"
      >
        <ChevronRight
          :size="15"
          aria-hidden="true"
          class="flex-none text-fg-subtle motion-safe:transition-transform motion-safe:duration-150"
          :class="{ 'rotate-90': expanded }"
        />
        <ProjectMarker v-if="branch.project" :color="branch.project.color" />
        <span class="min-w-0 truncate text-body font-semibold text-fg">{{ name }}</span>
        <span aria-hidden="true" class="flex-none text-meta text-fg-faint">
          {{ branch.tasks.length }}
        </span>
      </button>
      <AppMenu
        v-if="branch.project"
        :label="t('projects.actions', { name: branch.project.name })"
        :items="projectMenu(branch.project)"
        size="sm"
      />
    </div>
    <div v-if="expanded" :id="groupId" role="group" :aria-label="name">
      <slot />
      <p v-if="branch.tasks.length === 0" class="py-2 pr-3 pl-10 text-small text-fg-subtle">
        {{ t("picker.emptyProject") }}
      </p>
    </div>
  </div>
</template>
