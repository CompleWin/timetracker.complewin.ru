<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FolderPlus,
  ListPlus,
  Plus,
  Search,
  Star,
} from "@lucide/vue";
import type { Project, SessionWithTask, Task } from "@stt/shared";
import { computed, nextTick, onMounted, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  canCreate,
  createTarget,
  foundTasks,
  isSearching,
  parseSearch,
  pinnedTasks,
  projectBranches,
  recentTasks,
} from "../task-picker.ts";
import PickerBranch from "./PickerBranch.vue";
import PickerTaskRow from "./PickerTaskRow.vue";
import AppKbd from "./ui/AppKbd.vue";
import AppMenu, { type MenuItem } from "./ui/AppMenu.vue";
import AppSectionLabel from "./ui/AppSectionLabel.vue";

export type NewTaskRequest = { title: string; projectId: string | null };

type PickerEntry = { key: string; task: Task | null };

const CREATE_KEY = "create";

const props = defineProps<{
  tasks: Task[];
  projects: Project[];
  running: Map<string, SessionWithTask>;
  todaySec: Map<string, number>;
  now: number;
  canAddFromNotion: boolean;
}>();
const emit = defineEmits<{
  start: [task: Task];
  create: [request: NewTaskRequest];
  pin: [task: Task];
  newTask: [];
  newProject: [];
  editProject: [project: Project];
  archiveProject: [project: Project];
  addFromNotion: [];
  close: [];
}>();

const { t } = useI18n();
const query = ref("");
const highlightedIndex = ref(0);
const searchField = useTemplateRef("searchField");
const list = useTemplateRef("list");
const recentLabelId = useId();
const treeLabelId = useId();
const foundLabelId = useId();
const createCaptionId = useId();

const branches = computed(() => projectBranches(props.projects, props.tasks));
const toggledBranches = ref(new Map<string, boolean>());
const projectsById = computed(
  () => new Map(props.projects.map((project) => [project.id, project])),
);
const searching = computed(() => isSearching(query.value));
const search = computed(() => parseSearch(query.value));
const pinned = computed(() => pinnedTasks(props.tasks));
const recent = computed(() => recentTasks(props.tasks));
const found = computed(() => foundTasks(props.tasks, props.projects, search.value));
const showCreate = computed(() => canCreate(search.value, found.value));
const target = computed(() => createTarget(props.projects, search.value));

const createCaption = computed(() => {
  const current = target.value;
  if (current.kind === "project") return current.project.name;
  return t(current.kind === "noSuchProject" ? "picker.noSuchProject" : "picker.withoutProject");
});

const entries = computed<PickerEntry[]>(() => {
  if (searching.value) {
    const createEntry = showCreate.value ? [{ key: CREATE_KEY, task: null }] : [];
    return [...found.value.map((task) => ({ key: `found:${task.id}`, task })), ...createEntry];
  }
  const treeEntries = branches.value
    .filter((branch) => isExpanded(branch.key))
    .flatMap((branch) => branch.tasks.map((task) => ({ key: `tree:${task.id}`, task })));
  return [...recent.value.map((task) => ({ key: `recent:${task.id}`, task })), ...treeEntries];
});

const highlightedKey = computed(() => entries.value[highlightedIndex.value]?.key);

const createItems = computed<MenuItem[]>(() => [
  { label: t("tasks.new"), icon: ListPlus, select: () => emit("newTask") },
  { label: t("projects.new"), icon: FolderPlus, select: () => emit("newProject") },
]);

watch(query, () => (highlightedIndex.value = 0));
watch(entries, (current) => {
  if (highlightedIndex.value >= current.length) highlightedIndex.value = 0;
});

onMounted(() => searchField.value?.focus());

function projectOf(task: Task): Project | null {
  return projectsById.value.get(task.projectId ?? "") ?? null;
}

function isExpanded(key: string): boolean {
  return toggledBranches.value.get(key) ?? key === branches.value[0]?.key;
}

function toggleBranch(key: string): void {
  toggledBranches.value = new Map(toggledBranches.value).set(key, !isExpanded(key));
}

function highlight(key: string): void {
  const index = entries.value.findIndex((entry) => entry.key === key);
  if (index !== -1) highlightedIndex.value = index;
}

function choose(task: Task): void {
  if (props.running.has(task.id)) emit("close");
  else emit("start", task);
}

function createFromSearch(): void {
  const title = search.value.taskText;
  if (title === "") return;
  const current = target.value;
  emit("create", { title, projectId: current.kind === "project" ? current.project.id : null });
}

function activateHighlighted(): void {
  const entry = entries.value[highlightedIndex.value];
  if (entry === undefined) return;
  if (entry.task === null) createFromSearch();
  else choose(entry.task);
}

async function moveHighlight(step: number): Promise<void> {
  const last = entries.value.length - 1;
  highlightedIndex.value = Math.min(Math.max(highlightedIndex.value + step, 0), Math.max(last, 0));
  await nextTick();
  list.value
    ?.querySelector(`[data-entry="${highlightedKey.value}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    void moveHighlight(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) createFromSearch();
    else activateHighlighted();
  }
}

function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  event.preventDefault();
  emit("close");
}
</script>

<template>
  <div
    class="overflow-hidden rounded-island border border-line bg-surface-island shadow-popover"
    @keydown="onPanelKeydown"
  >
    <div class="flex gap-2 px-3 pt-3 pb-2.5">
      <div class="relative min-w-0 flex-1">
        <Search
          :size="17"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-4 my-auto text-fg-faint"
        />
        <input
          ref="searchField"
          v-model="query"
          type="text"
          autocomplete="off"
          :aria-label="t('home.search')"
          :placeholder="t('picker.placeholder')"
          class="h-12 w-full min-w-0 rounded-full border-2 border-primary bg-transparent pr-4 pl-11 text-input text-fg placeholder:text-fg-faint"
          @keydown="onSearchKeydown"
        />
      </div>
      <AppMenu
        :label="t('form.create')"
        :icon="Plus"
        :items="createItems"
        size="xl"
        tone="outlined"
      />
    </div>

    <div
      v-if="!searching && pinned.length > 0"
      role="group"
      :aria-label="t('picker.pinned')"
      class="flex flex-wrap gap-2 px-3 pb-2"
    >
      <button
        v-for="task in pinned"
        :key="task.id"
        type="button"
        :aria-label="
          running.has(task.id)
            ? t('picker.alreadyRunning', { title: task.title })
            : t('timers.startTask', { title: task.title })
        "
        class="inline-flex h-[30px] max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-primary-soft px-3 text-meta text-primary-ink transition-colors duration-150 hover:bg-primary-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="choose(task)"
      >
        <span class="truncate">{{ task.title }}</span>
        <Star :size="13" aria-hidden="true" class="flex-none fill-current text-project-yellow" />
      </button>
    </div>

    <div ref="list" class="max-h-[min(400px,55vh)] overflow-y-auto px-2 pb-2">
      <template v-if="!searching">
        <p v-if="tasks.length === 0" class="px-3 py-2 text-small text-fg-subtle">
          {{ t("home.empty") }}
        </p>
        <div v-if="recent.length > 0" role="group" :aria-labelledby="recentLabelId">
          <AppSectionLabel :id="recentLabelId" class="px-3 pt-3 pb-1">
            {{ t("picker.recent") }}
          </AppSectionLabel>
          <PickerTaskRow
            v-for="task in recent"
            :key="task.id"
            :task
            :project="projectOf(task)"
            with-project
            :nested="false"
            :running="running.get(task.id)"
            :today-sec="todaySec.get(task.id) ?? 0"
            :highlighted="highlightedKey === `recent:${task.id}`"
            :entry-key="`recent:${task.id}`"
            :now
            @choose="choose(task)"
            @pin="emit('pin', task)"
            @hover="highlight(`recent:${task.id}`)"
          />
        </div>
        <div v-if="branches.length > 0" role="group" :aria-labelledby="treeLabelId">
          <AppSectionLabel :id="treeLabelId" class="px-3 pt-3 pb-1">
            {{ t("picker.tree") }}
          </AppSectionLabel>
          <PickerBranch
            v-for="branch in branches"
            :key="branch.key"
            :branch
            :expanded="isExpanded(branch.key)"
            @toggle="toggleBranch(branch.key)"
            @edit-project="(project) => emit('editProject', project)"
            @archive-project="(project) => emit('archiveProject', project)"
          >
            <PickerTaskRow
              v-for="task in branch.tasks"
              :key="task.id"
              :task
              :project="branch.project"
              :with-project="false"
              nested
              :running="running.get(task.id)"
              :today-sec="todaySec.get(task.id) ?? 0"
              :highlighted="highlightedKey === `tree:${task.id}`"
              :entry-key="`tree:${task.id}`"
              :now
              @choose="choose(task)"
              @pin="emit('pin', task)"
              @hover="highlight(`tree:${task.id}`)"
            />
          </PickerBranch>
        </div>
      </template>
      <template v-else>
        <div v-if="found.length > 0" role="group" :aria-labelledby="foundLabelId">
          <AppSectionLabel :id="foundLabelId" class="px-3 pt-3 pb-1">
            {{ t("picker.found") }}
          </AppSectionLabel>
          <PickerTaskRow
            v-for="task in found"
            :key="task.id"
            :task
            :project="projectOf(task)"
            with-project
            :nested="false"
            :running="running.get(task.id)"
            :today-sec="todaySec.get(task.id) ?? 0"
            :highlighted="highlightedKey === `found:${task.id}`"
            :entry-key="`found:${task.id}`"
            :now
            @choose="choose(task)"
            @pin="emit('pin', task)"
            @hover="highlight(`found:${task.id}`)"
          />
        </div>
        <p v-else class="px-3 py-2 text-small text-fg-subtle">{{ t("picker.nothingFound") }}</p>
        <div
          v-if="showCreate"
          :data-entry="CREATE_KEY"
          class="mt-1 flex min-h-[46px] items-center gap-2 rounded-field px-3 transition-colors duration-150"
          :class="{ 'bg-primary-soft': highlightedKey === CREATE_KEY }"
          @pointerenter="highlight(CREATE_KEY)"
        >
          <button
            type="button"
            :aria-describedby="createCaptionId"
            class="flex min-h-[46px] min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-body font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="createFromSearch"
          >
            <Plus :size="17" aria-hidden="true" class="flex-none" />
            <span class="min-w-0 truncate">
              {{ t("picker.createTask", { text: search.taskText }) }}
            </span>
          </button>
          <span
            :id="createCaptionId"
            class="max-w-[40%] flex-none truncate text-meta text-fg-subtle"
          >
            {{ createCaption }}
          </span>
        </div>
      </template>
      <button
        v-if="canAddFromNotion"
        type="button"
        class="mt-1 flex min-h-[46px] w-full cursor-pointer items-center gap-2 rounded-field px-3 text-left text-body text-primary transition-colors duration-150 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="emit('addFromNotion')"
      >
        <ExternalLink :size="17" aria-hidden="true" class="flex-none" />
        {{ t("notionPages.title") }}
      </button>
    </div>

    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-surface-page px-4 py-2.5 text-meta text-fg-subtle"
    >
      <span>{{ t("picker.hint") }}</span>
      <span class="inline-flex items-center gap-1.5">
        <AppKbd>#</AppKbd>
        {{ t("picker.hintProject") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <AppKbd><ArrowUp :size="13" /><ArrowDown :size="13" /></AppKbd>
        {{ t("picker.hintSelect") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <AppKbd>Esc</AppKbd>
        {{ t("picker.hintClose") }}
      </span>
    </div>
  </div>
</template>
