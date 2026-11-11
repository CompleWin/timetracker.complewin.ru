<script setup lang="ts">
import { Plus, Search } from "@lucide/vue";
import { tc, type Project, type SessionWithTask, type Task } from "@stt/shared";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as api from "../api.ts";
import { useAutoRefresh } from "../auto-refresh.ts";
import { changeEach, type BulkResult } from "../bulk-change.ts";
import ProjectDialog from "../components/ProjectDialog.vue";
import SelectionPanel, { NO_MOVE_TARGET } from "../components/SelectionPanel.vue";
import TaskDialog from "../components/TaskDialog.vue";
import TaskListGroup from "../components/TaskListGroup.vue";
import AppButton from "../components/ui/AppButton.vue";
import AppCheckbox from "../components/ui/AppCheckbox.vue";
import AppConfirmDialog from "../components/ui/AppConfirmDialog.vue";
import AppEmptyState from "../components/ui/AppEmptyState.vue";
import AppFormError from "../components/ui/AppFormError.vue";
import AppIsland from "../components/ui/AppIsland.vue";
import AppSkeleton from "../components/ui/AppSkeleton.vue";
import { currentLocale } from "../i18n.ts";
import { useServerNow } from "../server-clock.ts";
import { useSessionStore } from "../stores/session.ts";
import { searchBranches, tasksOf } from "../task-list.ts";
import { projectBranches } from "../task-picker.ts";
import { sessionsByTask } from "../timers.ts";

type OpenDialog =
  | { kind: "project"; project?: Project }
  | { kind: "newTask" }
  | { kind: "editTask"; task: Task }
  | { kind: "archiveSelected"; count: number };

const { t } = useI18n();
const account = useSessionStore();
const projects = ref<Project[]>([]);
const tasks = ref<Task[]>([]);
const running = ref<SessionWithTask[]>([]);
const loaded = ref(false);
const dialog = ref<OpenDialog | null>(null);
const query = ref("");
const selectedIds = ref<ReadonlySet<string>>(new Set());
const moveTarget = ref(NO_MOVE_TARGET);
const busy = ref(false);
const failure = ref<BulkResult | null>(null);
const now = useServerNow();
let latestReload = 0;

const timeZone = computed(() => account.user?.timezone ?? null);
const branches = computed(() => projectBranches(projects.value, tasks.value));
const shownBranches = computed(() => searchBranches(branches.value, query.value));
const allTasks = computed(() => tasksOf(branches.value));
const shownTasks = computed(() => tasksOf(shownBranches.value));
const runningByTask = computed(() => sessionsByTask(running.value));
const selectedTasks = computed(() => allTasks.value.filter((task) => isSelected(task)));
const allShownSelected = computed(
  () => shownTasks.value.length > 0 && shownTasks.value.every((task) => isSelected(task)),
);
const someShownSelected = computed(() => shownTasks.value.some((task) => isSelected(task)));
const selectAll = computed({
  get: () => allShownSelected.value,
  set: toggleAllShown,
});
const failureText = computed(() =>
  failure.value === null
    ? ""
    : t("tasksPage.partialFailure", {
        failed: failure.value.failedIds.length,
        total: failure.value.total,
      }),
);

onMounted(reload);
useAutoRefresh(reload);
watch(query, () => select([]));

async function reload(): Promise<void> {
  const reloadNumber = ++latestReload;
  const loadedData = await Promise.all([
    api.fetchProjects("false"),
    api.fetchTasks("false"),
    api.fetchActiveSessions(),
  ]);
  if (reloadNumber !== latestReload) return;
  [projects.value, tasks.value, running.value] = loadedData;
  loaded.value = true;
  select(selectedTasks.value.map((task) => task.id));
}

function isSelected(task: Task): boolean {
  return selectedIds.value.has(task.id);
}

function select(ids: string[]): void {
  selectedIds.value = new Set(ids);
}

function toggle(task: Task): void {
  const others = [...selectedIds.value].filter((id) => id !== task.id);
  select(isSelected(task) ? others : [...others, task.id]);
}

function toggleAllShown(): void {
  select(allShownSelected.value ? [] : shownTasks.value.map((task) => task.id));
}

async function changeAndReload(change: () => Promise<unknown>): Promise<void> {
  await change();
  await reload();
}

function archiveTask(task: Task): Promise<void> {
  return changeAndReload(() => api.updateTask(task.id, { archived: true }));
}

function archiveProject(project: Project): Promise<void> {
  return changeAndReload(() => api.updateProject(project.id, { archived: true }));
}

function moveSelected(projectId: string | null): Promise<void> {
  const moving = selectedTasks.value.filter((task) => task.projectId !== projectId);
  return changeSelected(moving, (task) => api.updateTask(task.id, { projectId }));
}

function archiveSelected(): Promise<void> {
  dialog.value = null;
  return changeSelected(selectedTasks.value, (task) => api.updateTask(task.id, { archived: true }));
}

async function changeSelected(
  targets: Task[],
  change: (task: Task) => Promise<unknown>,
): Promise<void> {
  busy.value = true;
  try {
    showResult(await changeEach(targets, change));
    await reload();
  } finally {
    busy.value = false;
  }
}

function showResult(result: BulkResult): void {
  select(result.failedIds);
  if (result.failedIds.length > 0) {
    failure.value = result;
    return;
  }
  failure.value = null;
  moveTarget.value = NO_MOVE_TARGET;
}

async function onSaved(): Promise<void> {
  dialog.value = null;
  await reload();
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3">
    <div class="min-w-0 flex-[1_1_260px]">
      <h1 class="text-h2">{{ t("header.tasks") }}</h1>
      <p class="text-small text-fg-subtle">{{ t("tasksPage.hint") }}</p>
    </div>
    <div class="flex flex-wrap gap-3">
      <AppButton variant="outline-primary" @click="dialog = { kind: 'project' }">
        <Plus :size="17" aria-hidden="true" />
        {{ t("projects.new") }}
      </AppButton>
      <AppButton variant="outline-primary" @click="dialog = { kind: 'newTask' }">
        <Plus :size="17" aria-hidden="true" />
        {{ t("tasks.new") }}
      </AppButton>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
    <div class="relative w-full md:w-[360px]">
      <Search
        :size="17"
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 left-4 my-auto text-fg-faint"
      />
      <input
        v-model="query"
        type="search"
        autocomplete="off"
        :aria-label="t('tasksPage.search')"
        :placeholder="t('tasksPage.searchPlaceholder')"
        class="h-[46px] w-full min-w-0 rounded-full border border-line-strong bg-transparent pr-4 pl-11 text-input text-fg transition-colors duration-150 placeholder:text-fg-faint focus:border-primary"
      />
    </div>
    <AppCheckbox
      v-model="selectAll"
      :label="t('tasksPage.selectAll')"
      :indeterminate="someShownSelected && !allShownSelected"
      :disabled="shownTasks.length === 0"
    />
  </div>

  <AppFormError v-if="failure" placement="form" dismissible @dismiss="failure = null">
    {{ failureText }}
  </AppFormError>

  <AppIsland v-if="!loaded">
    <AppSkeleton />
  </AppIsland>
  <AppIsland v-else-if="branches.length === 0">
    <AppEmptyState :title="t('home.empty')" />
  </AppIsland>
  <AppIsland v-else-if="shownBranches.length === 0">
    <AppEmptyState :title="t('picker.nothingFound')" />
  </AppIsland>
  <template v-else>
    <TaskListGroup
      v-for="branch in shownBranches"
      :key="branch.key"
      :branch
      :selected-ids="selectedIds"
      :running="runningByTask"
      :now
      :time-zone
      @toggle="toggle"
      @edit="(task) => (dialog = { kind: 'editTask', task })"
      @archive="archiveTask"
      @edit-project="(project) => (dialog = { kind: 'project', project })"
      @archive-project="archiveProject"
    />
  </template>

  <SelectionPanel
    v-if="selectedIds.size > 0"
    v-model:target="moveTarget"
    :count="selectedIds.size"
    :projects
    :busy
    @move="moveSelected"
    @archive="dialog = { kind: 'archiveSelected', count: selectedIds.size }"
    @clear="select([])"
  />

  <ProjectDialog
    v-if="dialog?.kind === 'project'"
    :project="dialog.project"
    online-only
    @close="dialog = null"
    @saved="onSaved"
  />
  <TaskDialog
    v-if="dialog?.kind === 'newTask'"
    :projects
    without-start
    online-only
    @close="dialog = null"
    @saved="onSaved"
  />
  <TaskDialog
    v-if="dialog?.kind === 'editTask'"
    :projects
    :task="dialog.task"
    online-only
    @close="dialog = null"
    @saved="onSaved"
  />
  <AppConfirmDialog
    v-if="dialog?.kind === 'archiveSelected'"
    :title="tc(currentLocale(), 'tasksPage.archiveQuestion', dialog.count)"
    :confirm-label="t('actions.archive')"
    @close="dialog = null"
    @confirm="archiveSelected"
  >
    {{ t("tasksPage.archiveNote") }}
  </AppConfirmDialog>
</template>
