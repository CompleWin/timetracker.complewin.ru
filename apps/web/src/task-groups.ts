import { titleMatches, type Project, type Task } from "@stt/shared";

export type TaskGroup = {
  project: Project | null;
  tasks: Task[];
};

export function groupTasks(projects: Project[], tasks: Task[], search: string): TaskGroup[] {
  const isSearching = search.trim() !== "";
  const found = tasks.filter((task) => titleMatches(task.title, search));
  const groups = [...projects.map((project) => groupOf(project, found)), groupOf(null, found)];
  return groups.filter(
    (group) => group.tasks.length > 0 || (group.project !== null && !isSearching),
  );
}

function groupOf(project: Project | null, tasks: Task[]): TaskGroup {
  const projectId = project?.id ?? null;
  return { project, tasks: tasks.filter((task) => task.projectId === projectId) };
}
