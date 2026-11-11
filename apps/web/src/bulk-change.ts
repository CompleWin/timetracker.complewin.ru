import type { Task } from "@stt/shared";

export type BulkResult = { failedIds: string[]; total: number };

export async function changeEach(
  tasks: Task[],
  change: (task: Task) => Promise<unknown>,
): Promise<BulkResult> {
  const failedIds: string[] = [];
  for (const task of tasks) {
    if (!(await succeeds(() => change(task)))) failedIds.push(task.id);
  }
  return { failedIds, total: tasks.length };
}

async function succeeds(change: () => Promise<unknown>): Promise<boolean> {
  try {
    await change();
    return true;
  } catch {
    return false;
  }
}
