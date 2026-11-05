<script setup lang="ts">
import { Search } from "@lucide/vue";
import type { Project, SessionWithTask, Task } from "@stt/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isOnline } from "../connection.ts";
import { sessionsByTask } from "../timers.ts";
import RunningTimers from "./RunningTimers.vue";
import TaskPicker, { type NewTaskRequest } from "./TaskPicker.vue";
import AppButton from "./ui/AppButton.vue";
import AppIsland from "./ui/AppIsland.vue";
import AppKbd from "./ui/AppKbd.vue";

const props = defineProps<{
  tasks: Task[];
  projects: Project[];
  running: SessionWithTask[];
  todaySec: Map<string, number>;
  now: number;
  timeZone: string | null;
  canAddFromNotion: boolean;
}>();
const emit = defineEmits<{
  start: [task: Task];
  create: [request: NewTaskRequest];
  pin: [task: Task];
  stop: [session: SessionWithTask];
  stopAll: [];
  addManually: [];
  newTask: [];
  newProject: [];
  editProject: [project: Project];
  archiveProject: [project: Project];
  addFromNotion: [];
}>();

const { t } = useI18n();
const pickerOpen = ref(false);
const trigger = useTemplateRef("trigger");
const panel = useTemplateRef("panel");

const projectsById = computed(
  () => new Map(props.projects.map((project) => [project.id, project])),
);
const runningByTask = computed(() => sessionsByTask(props.running));

watch(pickerOpen, (open) => (open ? listenForPressOutside() : stopListening()));
watch(isOnline, (online) => {
  if (!online) pickerOpen.value = false;
});

onMounted(() => document.addEventListener("keydown", openOnShortcut));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", openOnShortcut);
  stopListening();
});

function togglePicker(): void {
  pickerOpen.value = !pickerOpen.value;
}

async function closePicker(): Promise<void> {
  pickerOpen.value = false;
  await nextTick();
  trigger.value?.focus();
}

async function closeThen(action: () => void): Promise<void> {
  await closePicker();
  action();
}

function openOnShortcut(event: KeyboardEvent): void {
  if (event.code !== "KeyN" || event.ctrlKey || event.altKey || event.metaKey) return;
  if (pickerOpen.value || !isOnline.value || isTyping(event.target) || hasOpenDialog()) return;
  event.preventDefault();
  pickerOpen.value = true;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function hasOpenDialog(): boolean {
  return document.querySelector("dialog[open]") !== null;
}

function closeOnPressOutside(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (panel.value?.contains(target) || trigger.value?.contains(target)) return;
  pickerOpen.value = false;
}

function listenForPressOutside(): void {
  document.addEventListener("pointerdown", closeOnPressOutside, true);
}

function stopListening(): void {
  document.removeEventListener("pointerdown", closeOnPressOutside, true);
}
</script>

<template>
  <AppIsland padding="none" :accent="running.length > 0" class="relative z-10">
    <RunningTimers
      v-if="running.length > 0"
      :sessions="running"
      :projects="projectsById"
      :now
      :time-zone
      @stop="(session) => emit('stop', session)"
      @stop-all="emit('stopAll')"
    />
    <div class="relative flex flex-wrap items-center gap-2.5 p-3">
      <div class="min-w-0 flex-[1_1_260px] md:relative">
        <button
          ref="trigger"
          type="button"
          :aria-expanded="pickerOpen"
          :disabled="!isOnline"
          class="flex h-[52px] w-full cursor-pointer items-center gap-3 rounded-full border bg-transparent pr-3 pl-4 text-left transition-colors duration-150 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          :class="pickerOpen ? 'border-primary' : 'border-line-strong'"
          @click="togglePicker"
        >
          <Search :size="17" aria-hidden="true" class="flex-none text-fg-faint" />
          <span class="min-w-0 flex-1 truncate text-input text-fg-faint">
            {{ t("launch.trigger") }}
          </span>
          <AppKbd>N</AppKbd>
        </button>
        <div
          v-if="pickerOpen"
          ref="panel"
          class="absolute inset-x-0 top-[64px] z-20 md:top-[60px] md:right-auto md:w-[min(600px,calc(100vw-24px))]"
        >
          <TaskPicker
            :tasks
            :projects
            :running="runningByTask"
            :today-sec
            :now
            :can-add-from-notion
            @start="(task) => closeThen(() => emit('start', task))"
            @create="(request) => closeThen(() => emit('create', request))"
            @pin="(task) => emit('pin', task)"
            @new-task="closeThen(() => emit('newTask'))"
            @new-project="closeThen(() => emit('newProject'))"
            @add-from-notion="closeThen(() => emit('addFromNotion'))"
            @edit-project="(project) => closeThen(() => emit('editProject', project))"
            @archive-project="(project) => emit('archiveProject', project)"
            @close="closePicker"
          />
        </div>
      </div>
      <AppButton variant="quiet-accent" :disabled="!isOnline" @click="emit('addManually')">
        {{ t("launch.addManually") }}
      </AppButton>
    </div>
  </AppIsland>
</template>
