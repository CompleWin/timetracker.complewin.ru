import { locales, t, type Locale, type MessageKey, type NotionProjectMode } from "@stt/shared";
import { propertyConflict } from "../http/errors.ts";

export const trackerProperties = [
  "spentHours",
  "spent",
  "running",
  "lastTracked",
  "project",
] as const;

export type TrackerProperty = (typeof trackerProperties)[number];

export type TrackerPropertyIds = Partial<Record<TrackerProperty | "title", string>>;

export type SchemaProperty = {
  id: string;
  name: string;
  type: string;
};

export type MissingProperty = {
  property: TrackerProperty;
  name: string;
  type: string;
};

export type TrackerPropertyMatch = {
  ids: TrackerPropertyIds;
  missing: MissingProperty[];
};

const propertyTypes: Record<TrackerProperty, string> = {
  spentHours: "number",
  spent: "rich_text",
  running: "checkbox",
  lastTracked: "date",
  project: "select",
};

const propertyNames: Record<TrackerProperty, MessageKey> = {
  spentHours: "notion.property.spentHours",
  spent: "notion.property.spent",
  running: "notion.property.running",
  lastTracked: "notion.property.lastTracked",
  project: "notion.property.project",
};

export function trackerPropertiesFor(mode: NotionProjectMode): TrackerProperty[] {
  return trackerProperties.filter((property) => mode === "own" || property !== "project");
}

export function matchTrackerProperties(
  schema: SchemaProperty[],
  wanted: TrackerProperty[],
  locale: Locale,
): TrackerPropertyMatch {
  const ids: TrackerPropertyIds = {};
  const missing: MissingProperty[] = [];
  for (const property of wanted) {
    const found = findTrackerProperty(schema, property);
    if (found === undefined) missing.push(newProperty(property, locale));
    else ids[property] = found.id;
  }
  return { ids, missing };
}

export function addedPropertyIds(
  schema: SchemaProperty[],
  added: MissingProperty[],
): TrackerPropertyIds {
  const ids: TrackerPropertyIds = {};
  for (const { property, name } of added) {
    const found = schema.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`Notion did not add property "${name}"`);
    ids[property] = found.id;
  }
  return ids;
}

function findTrackerProperty(
  schema: SchemaProperty[],
  property: TrackerProperty,
): SchemaProperty | undefined {
  const names = locales.map((locale) => t(locale, propertyNames[property]));
  const namesakes = schema.filter((candidate) => names.includes(candidate.name));
  const matching = namesakes.find((candidate) => candidate.type === propertyTypes[property]);
  const [conflicting] = namesakes;
  if (matching === undefined && conflicting !== undefined) {
    throw propertyConflict(conflicting.name);
  }
  return matching;
}

function newProperty(property: TrackerProperty, locale: Locale): MissingProperty {
  return { property, name: t(locale, propertyNames[property]), type: propertyTypes[property] };
}
