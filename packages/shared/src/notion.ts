import { z } from "zod";
import { atLeastOneField } from "./patch.ts";

export const notionConnectionStatuses = ["ok", "needs_reauth"] as const;

export type NotionConnectionStatus = (typeof notionConnectionStatuses)[number];

export const notionProjectModes = ["own", "property", "none"] as const;

export type NotionProjectMode = (typeof notionProjectModes)[number];

export const notionBlockPositions = ["start", "end", "none"] as const;

export type NotionBlockPosition = (typeof notionBlockPositions)[number];

export const notionProjectPropertyTypes = ["select", "multi_select"] as const;

export type NotionProjectPropertyType = (typeof notionProjectPropertyTypes)[number];

export const MAX_NOTION_DATABASES = 50;

export const notionPropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(notionProjectPropertyTypes),
});

export type NotionProperty = z.infer<typeof notionPropertySchema>;

export const notionDatabaseSchema = z.object({
  id: z.string(),
  dataSourceId: z.string(),
  databaseId: z.string(),
  title: z.string(),
  projectMode: z.enum(notionProjectModes),
  projectProperty: notionPropertySchema.nullable(),
  blockPosition: z.enum(notionBlockPositions),
  timeProperties: z.boolean(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});

export type NotionDatabase = z.infer<typeof notionDatabaseSchema>;

export const notionConnectionSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  workspaceIcon: z.string().nullable(),
  status: z.enum(notionConnectionStatuses),
  databases: z.array(notionDatabaseSchema),
  createdAt: z.string(),
});

export type NotionConnection = z.infer<typeof notionConnectionSchema>;

export const notionConnectionResponse = z.object({
  connection: notionConnectionSchema.nullable(),
});

export const availableNotionDatabaseSchema = z.object({
  dataSourceId: z.string(),
  databaseId: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  addedId: z.string().nullable(),
});

export type AvailableNotionDatabase = z.infer<typeof availableNotionDatabaseSchema>;

export const availableNotionDatabasesResponse = z.object({
  databases: z.array(availableNotionDatabaseSchema),
});

export const notionPropertiesResponse = z.object({
  properties: z.array(notionPropertySchema),
});

export const notionDatabaseResponse = z.object({ database: notionDatabaseSchema });

const PROJECT_PROPERTY_REQUIRED = "Required when projectMode is property";

const notionDatabaseSettings = z.object({
  projectMode: z.enum(notionProjectModes),
  projectPropertyId: z.string().trim().min(1).optional(),
  blockPosition: z.enum(notionBlockPositions),
  timeProperties: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

type ProjectPropertyChoice = {
  projectMode?: NotionProjectMode;
  projectPropertyId?: string;
};

function hasProjectPropertyWhenNeeded({ projectMode, projectPropertyId }: ProjectPropertyChoice) {
  return projectMode !== "property" || projectPropertyId !== undefined;
}

const projectPropertyRule = {
  message: PROJECT_PROPERTY_REQUIRED,
  path: ["projectPropertyId"],
};

export const addNotionDatabaseBody = notionDatabaseSettings
  .extend({ dataSourceId: z.string().trim().min(1) })
  .refine(hasProjectPropertyWhenNeeded, projectPropertyRule);

export type AddNotionDatabaseBody = z.infer<typeof addNotionDatabaseBody>;

export const updateNotionDatabaseBody = atLeastOneField(notionDatabaseSettings.partial()).refine(
  hasProjectPropertyWhenNeeded,
  projectPropertyRule,
);

export type UpdateNotionDatabaseBody = z.infer<typeof updateNotionDatabaseBody>;

export const syncFailureSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  error: z.string(),
  attempts: z.number(),
});

export type SyncFailure = z.infer<typeof syncFailureSchema>;

export const syncStatusSchema = z.object({
  pendingTasks: z.number(),
  failed: z.array(syncFailureSchema),
  lastRunAt: z.string().nullable(),
});

export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const notionExportResponse = z.object({ queued: z.number() });

export const notionPageSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  url: z.string(),
  linkedTaskId: z.string().nullable(),
});

export type NotionPage = z.infer<typeof notionPageSchema>;

export const notionPagesResponse = z.object({ pages: z.array(notionPageSchema) });

export const notionPageQuery = z.object({
  databaseId: z.string().optional(),
  q: z.string().optional(),
  includeCompleted: z.enum(["true", "false"]).optional(),
});

export type NotionPageQuery = z.infer<typeof notionPageQuery>;

export const linkNotionPageBody = z.object({ projectId: z.string().optional() });

export type LinkNotionPageBody = z.infer<typeof linkNotionPageBody>;
