import { z } from "zod";
import { archivedFilter } from "./archived-filter.ts";
import { atLeastOneField } from "./patch.ts";

export const projectColors = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

export type ProjectColor = (typeof projectColors)[number];

export const PROJECT_NAME_MAX_LENGTH = 100;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(projectColors),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  totalSec: z.number(),
  notionDatabaseId: z.string().nullable(),
});

export type Project = z.infer<typeof projectSchema>;

export const projectResponse = z.object({ project: projectSchema });

export const projectsResponse = z.object({ projects: z.array(projectSchema) });

const projectName = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);

const notionDatabaseReference = z.uuid().nullable();

export const createProjectBody = z.object({
  name: projectName,
  color: z.enum(projectColors).default("default"),
  notionDatabaseId: notionDatabaseReference.default(null),
});

export type CreateProjectBody = z.input<typeof createProjectBody>;

export const updateProjectBody = atLeastOneField(
  z.object({
    name: projectName.optional(),
    color: z.enum(projectColors).optional(),
    archived: z.boolean().optional(),
    notionDatabaseId: notionDatabaseReference.optional(),
  }),
);

export type UpdateProjectBody = z.infer<typeof updateProjectBody>;

export const projectListQuery = z.object({ archived: archivedFilter });
