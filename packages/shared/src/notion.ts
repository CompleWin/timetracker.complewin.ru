import { z } from "zod";

export const notionConnectionStatuses = ["ok", "needs_reauth"] as const;

export type NotionConnectionStatus = (typeof notionConnectionStatuses)[number];

export const notionConnectionSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  workspaceIcon: z.string().nullable(),
  status: z.enum(notionConnectionStatuses),
  databases: z.array(z.never()),
  createdAt: z.string(),
});

export type NotionConnection = z.infer<typeof notionConnectionSchema>;

export const notionConnectionResponse = z.object({
  connection: notionConnectionSchema.nullable(),
});
