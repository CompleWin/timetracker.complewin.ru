import {
  projectColors,
  t,
  TASK_TITLE_MAX_LENGTH,
  type Locale,
  type ProjectColor,
} from "@stt/shared";
import { z } from "zod";

const optionSchema = z.object({ name: z.string(), color: z.string().optional() });

const propertyValueSchema = z.looseObject({
  id: z.string(),
  title: z.array(z.object({ plain_text: z.string() })).optional(),
  select: optionSchema.nullish(),
  multi_select: z.array(optionSchema).optional(),
});

export const notionPageJsonSchema = z.object({
  id: z.string(),
  url: z.string(),
  in_trash: z.boolean().optional(),
  last_edited_time: z.string(),
  parent: z.looseObject({ data_source_id: z.string().optional() }),
  properties: z.record(z.string(), propertyValueSchema),
});

export const pageListSchema = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullish(),
});

type PropertyValue = z.infer<typeof propertyValueSchema>;

export type NotionOption = {
  name: string;
  color: ProjectColor;
};

export type NotionPageSnapshot = {
  id: string;
  url: string;
  inTrash: boolean;
  dataSourceId: string | null;
  lastEditedAt: Date;
  properties: PropertyValue[];
};

export function toPageSnapshot(page: z.infer<typeof notionPageJsonSchema>): NotionPageSnapshot {
  return {
    id: page.id,
    url: page.url,
    inTrash: page.in_trash === true,
    dataSourceId: page.parent.data_source_id ?? null,
    lastEditedAt: new Date(page.last_edited_time),
    properties: Object.values(page.properties),
  };
}

export function pagesOf(results: unknown[]): NotionPageSnapshot[] {
  return results.flatMap((result) => {
    const page = notionPageJsonSchema.safeParse(result);
    return page.success ? [toPageSnapshot(page.data)] : [];
  });
}

export function dataSourceQueryPath(dataSourceId: string): string {
  return `/v1/data_sources/${encodeURIComponent(dataSourceId)}/query`;
}

export function pagePath(pageId: string): string {
  return `/v1/pages/${encodeURIComponent(pageId)}`;
}

export function taskTitleOf(
  page: NotionPageSnapshot,
  propertyId: string | undefined,
  locale: Locale,
): string {
  const title = pageTitle(page, propertyId).trim().slice(0, TASK_TITLE_MAX_LENGTH).trim();
  return title === "" ? t(locale, "notion.untitled") : title;
}

export function pageTitle(page: NotionPageSnapshot, propertyId: string | undefined): string {
  const title = propertyOf(page, propertyId)?.title ?? [];
  return title.map((part) => part.plain_text).join("");
}

export function selectOption(
  page: NotionPageSnapshot,
  propertyId: string | null | undefined,
): NotionOption | null {
  const selected = propertyOf(page, propertyId)?.select;
  return selected === null || selected === undefined ? null : toOption(selected);
}

export function multiSelectOptions(
  page: NotionPageSnapshot,
  propertyId: string | null | undefined,
): NotionOption[] {
  return (propertyOf(page, propertyId)?.multi_select ?? []).map(toOption);
}

function propertyOf(
  page: NotionPageSnapshot,
  propertyId: string | null | undefined,
): PropertyValue | undefined {
  return page.properties.find((property) => property.id === propertyId);
}

function toOption({ name, color }: z.infer<typeof optionSchema>): NotionOption {
  return { name, color: projectColors.find((candidate) => candidate === color) ?? "default" };
}
