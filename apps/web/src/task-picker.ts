import type { Project, Task } from "@stt/shared";

export type PickerSearch = {
  taskText: string;
  projectPrefix: string | null;
  hasHash: boolean;
};

export type ProjectBranch = {
  key: string;
  project: Project | null;
  tasks: Task[];
};

export type CreateTarget =
  { kind: "project"; project: Project } | { kind: "noSuchProject" } | { kind: "withoutProject" };

const PROJECT_MARK = "#";
const RECENT_LIMIT = 5;
const FOUND_LIMIT = 12;
const NO_PROJECT_KEY = "none";

export function parseSearch(text: string): PickerSearch {
  const markAt = text.indexOf(PROJECT_MARK);
  if (markAt === -1) return { taskText: text.trim(), projectPrefix: null, hasHash: false };
  const prefix = text.slice(markAt + PROJECT_MARK.length).trim();
  return {
    taskText: text.slice(0, markAt).trim(),
    projectPrefix: prefix === "" ? null : prefix,
    hasHash: true,
  };
}

export function isSearching(text: string): boolean {
  return text.trim() !== "";
}

export function pinnedTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.pinned);
}

export function recentTasks(tasks: Task[]): Task[] {
  return byRecency(tasks.filter(wasStarted)).slice(0, RECENT_LIMIT);
}

export function foundTasks(tasks: Task[], projects: Project[], search: PickerSearch): Task[] {
  const nameOf = projectNames(projects);
  const found = tasks.filter((task) => matches(task, nameOf(task.projectId), search));
  return [
    ...byRecency(found.filter(wasStarted)),
    ...found.filter((task) => !wasStarted(task)),
  ].slice(0, FOUND_LIMIT);
}

export function projectBranches(projects: Project[], tasks: Task[]): ProjectBranch[] {
  const branches = projects
    .filter((project) => !project.archived)
    .map((project) => ({
      key: project.id,
      project,
      tasks: tasks.filter((task) => task.projectId === project.id),
    }));
  const withoutProject = tasks.filter((task) => task.projectId === null);
  if (withoutProject.length === 0) return branches;
  return [...branches, { key: NO_PROJECT_KEY, project: null, tasks: withoutProject }];
}

export function canCreate(search: PickerSearch, found: Task[]): boolean {
  if (search.taskText === "") return false;
  const title = normalized(search.taskText);
  return !found.some((task) => normalized(task.title) === title);
}

export function createTarget(projects: Project[], search: PickerSearch): CreateTarget {
  if (search.projectPrefix === null) return { kind: "withoutProject" };
  const prefix = normalized(search.projectPrefix);
  const project = projects.find(
    (candidate) => !candidate.archived && normalized(candidate.name).startsWith(prefix),
  );
  return project === undefined ? { kind: "noSuchProject" } : { kind: "project", project };
}

function matches(task: Task, projectName: string | null, search: PickerSearch): boolean {
  return matchesText(task, projectName, search) && matchesProject(projectName, search);
}

function matchesText(task: Task, projectName: string | null, search: PickerSearch): boolean {
  const text = normalized(search.taskText);
  if (text === "" || normalized(task.title).includes(text)) return true;
  return !search.hasHash && projectName !== null && normalized(projectName).includes(text);
}

function matchesProject(projectName: string | null, search: PickerSearch): boolean {
  if (search.projectPrefix === null) return true;
  return (
    projectName !== null && normalized(projectName).startsWith(normalized(search.projectPrefix))
  );
}

function projectNames(projects: Project[]): (projectId: string | null) => string | null {
  const names = new Map(projects.map((project) => [project.id, project.name]));
  return (projectId) => (projectId === null ? null : (names.get(projectId) ?? null));
}

function wasStarted(task: Task): boolean {
  return task.lastStartedAt !== null;
}

function byRecency(tasks: Task[]): Task[] {
  return tasks.toSorted(
    (a, b) => Date.parse(b.lastStartedAt ?? "") - Date.parse(a.lastStartedAt ?? ""),
  );
}

function normalized(text: string): string {
  return text.toLocaleLowerCase();
}
