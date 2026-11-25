import {
  locales,
  notionTimeFields,
  notionTimeFieldTypes,
  t,
  type Locale,
  type MessageKey,
  type NotionProjectMode,
  type NotionTimeField,
  type NotionTimeFieldChoices,
  type NotionTimeFieldIds,
} from "@stt/shared";
import { propertyConflict, validationError } from "../http/errors.ts";

export type TrackerProperty = NotionTimeField | "project";

export type TrackerPropertyChoice = {
  projectMode: NotionProjectMode;
  timeProperties: boolean;
};

export type TrackerPropertyIds = Partial<Record<TrackerProperty | "title", string>>;

export type TimeFieldSettings = {
  propertyIds: NotionTimeFieldIds;
  revision: string | null;
  automaticFields?: readonly NotionTimeField[];
};

type TimeFieldTarget = {
  propertyIds: TrackerPropertyIds;
  timeProperties: boolean;
  timeFieldSettings: TimeFieldSettings | null;
};

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
  ...notionTimeFieldTypes,
  project: "select",
};

const propertyNames: Record<TrackerProperty, MessageKey> = {
  spentHours: "notion.property.spentHours",
  spent: "notion.property.spent",
  running: "notion.property.running",
  lastTracked: "notion.property.lastTracked",
  project: "notion.property.project",
};

export function trackerPropertiesFor({
  projectMode,
  timeProperties,
}: TrackerPropertyChoice): TrackerProperty[] {
  return [
    ...(timeProperties ? notionTimeFields : []),
    ...(projectMode === "own" ? (["project"] as const) : []),
  ];
}

export function newlyNeededProperties(
  current: TrackerPropertyChoice,
  next: TrackerPropertyChoice,
): TrackerProperty[] {
  const needed = trackerPropertiesFor(current);
  return trackerPropertiesFor(next).filter((property) => !needed.includes(property));
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

export function planSelectedTimeFields(
  schema: SchemaProperty[],
  choices: NotionTimeFieldChoices,
  plan: TrackerPropertyMatch,
): void {
  const used = new Set(schema.flatMap(({ id, name }) => [id, name]));
  for (const { name } of plan.missing) used.add(name);

  for (const property of notionTimeFields) {
    const choice = choices[property];
    if (choice === undefined) continue;
    const type = notionTimeFieldTypes[property];
    if (choice.mode === "create") {
      if (used.has(choice.name)) throw propertyConflict(choice.name);
      used.add(choice.name);
      plan.missing.push({ property, name: choice.name, type });
    } else {
      const column = schema.find(({ id }) => id === choice.propertyId);
      if (column?.type !== type) {
        throw validationError({
          [`timeFields.${property}`]: `Expected a ${type} column of this database`,
        });
      }
      plan.ids[property] = column.id;
    }
  }
}

export function selectTimeFieldIds(ids: TrackerPropertyIds): NotionTimeFieldIds {
  const fields: NotionTimeFieldIds = {};
  for (const field of notionTimeFields) {
    const id = ids[field];
    if (id !== undefined) fields[field] = id;
  }
  return fields;
}

export function timeFieldIdsOf(target: TimeFieldTarget): NotionTimeFieldIds {
  return (
    target.timeFieldSettings?.propertyIds ??
    (target.timeProperties ? selectTimeFieldIds(target.propertyIds) : {})
  );
}

export function missingAutomaticTimeFields(
  schema: SchemaProperty[],
  settings: TimeFieldSettings | null,
): NotionTimeField[] {
  if (settings === null) return [];
  return (settings.automaticFields ?? []).filter(
    (field) =>
      !schema.some(
        ({ id, type }) => id === settings.propertyIds[field] && type === propertyTypes[field],
      ),
  );
}

export function addedPropertyIds(
  schema: SchemaProperty[],
  added: MissingProperty[],
): TrackerPropertyIds {
  const ids: TrackerPropertyIds = {};
  for (const { property, name, type } of added) {
    const found = schema.find((candidate) => candidate.name === name && candidate.type === type);
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
