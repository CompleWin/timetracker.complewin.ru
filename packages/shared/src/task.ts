import { z } from "zod";
import { archivedFilter } from "./archived-filter.ts";
import { notionBlockPositions } from "./notion.ts";
import { atLeastOneField } from "./patch.ts";

export const TASK_TITLE_MAX_LENGTH = 300;

export const NO_PROJECT = "none";

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  archived: z.boolean(),
  archivedAt: z.string().nullable(),
  pinned: z.boolean(),
  notionPageUrl: z.string().nullable(),
  notionDatabaseId: z.string().nullable(),
  notionBlockPosition: z.enum(notionBlockPositions).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  totalSec: z.number(),
  runningSessionId: z.string().nullable(),
  lastStartedAt: z.string().nullable(),
});

export type Task = z.infer<typeof taskSchema>;

export const taskResponse = z.object({ task: taskSchema });

export const tasksResponse = z.object({ tasks: z.array(taskSchema) });

const taskTitle = z.string().trim().min(1).max(TASK_TITLE_MAX_LENGTH);

const projectReference = z.uuid().nullable();

export const createTaskBody = z.object({
  title: taskTitle,
  projectId: projectReference.default(null),
});

export type CreateTaskBody = z.input<typeof createTaskBody>;

export const updateTaskBody = atLeastOneField(
  z.object({
    title: taskTitle.optional(),
    projectId: projectReference.optional(),
    archived: z.boolean().optional(),
    pinned: z.boolean().optional(),
    notionBlockPosition: z.enum(notionBlockPositions).nullable().optional(),
  }),
);

export type UpdateTaskBody = z.infer<typeof updateTaskBody>;

export const taskListQuery = z.object({
  projectId: z.string().optional(),
  archived: archivedFilter,
  q: z.string().optional(),
});

export type TaskListQuery = z.infer<typeof taskListQuery>;

export function titleMatches(title: string, query: string): boolean {
  return title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
