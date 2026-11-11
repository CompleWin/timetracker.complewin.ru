import type { Task } from "@stt/shared";
import type { ProjectBranch } from "./task-picker.ts";

export function searchBranches(branches: ProjectBranch[], query: string): ProjectBranch[] {
  const text = query.trim().toLocaleLowerCase();
  if (text === "") return branches;
  return branches
    .map((branch) => ({ ...branch, tasks: matchingTasks(branch, text) }))
    .filter((branch) => branch.tasks.length > 0);
}

export function tasksOf(branches: ProjectBranch[]): Task[] {
  return branches.flatMap((branch) => branch.tasks);
}

function matchingTasks(branch: ProjectBranch, text: string): Task[] {
  if (branch.project?.name.toLocaleLowerCase().includes(text)) return branch.tasks;
  return branch.tasks.filter((task) => task.title.toLocaleLowerCase().includes(text));
}
