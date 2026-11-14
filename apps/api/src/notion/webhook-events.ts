import { z } from "zod";

const reference = z.looseObject({ id: z.string(), type: z.string() });

export const verificationRequest = z.looseObject({
  verification_token: z.string(),
  type: z.undefined().optional(),
});

export const notionEvent = z.looseObject({
  id: z.string(),
  type: z.string(),
  workspace_id: z.string(),
  entity: reference,
  authors: z.array(reference).optional().catch(undefined),
  accessible_by: z.array(reference).optional().catch(undefined),
  data: z
    .looseObject({ parent: z.looseObject({ id: z.string() }).optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

export type NotionEvent = z.infer<typeof notionEvent>;

export type NotionReference = z.infer<typeof reference>;

export const handledEventTypes: ReadonlySet<string> = new Set([
  "page.created",
  "page.properties_updated",
  "page.moved",
  "page.deleted",
  "page.undeleted",
]);

export function sameNotionId(left: string, right: string): boolean {
  return normalizedNotionId(left) === normalizedNotionId(right);
}

export function normalizedNotionId(id: string): string {
  return id.replaceAll("-", "").toLowerCase();
}
