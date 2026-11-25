import { formatDuration, notionTimeFields, type Locale } from "@stt/shared";
import type { NotionDatabaseRow } from "../notion/databases.ts";
import { timeFieldIdsOf } from "../notion/tracker-properties.ts";

const SECONDS_PER_HOUR = 3600;
const HOURS_PRECISION = 100;

export type TimeValues = {
  spentHours: number;
  spent: string;
  running: boolean;
  lastTracked: string | null;
};

export type SentPage = {
  title: string;
  project: string | null;
  time: TimeValues | null;
  timeFieldsRevision?: string | null;
};

export type TaskSnapshot = {
  title: string;
  project: string | null;
  totalSec: number;
  running: boolean;
  lastStartedAt: string | null;
};

export type PageProperties = Record<string, unknown>;

export type PageTarget = Pick<
  NotionDatabaseRow,
  | "propertyIds"
  | "projectMode"
  | "projectPropId"
  | "projectPropType"
  | "timeProperties"
  | "timeFieldSettings"
>;

export function pushedTarget<Target extends PageTarget>(
  target: Target,
  onDefaultProject: boolean,
): Target {
  return onDefaultProject ? { ...target, projectMode: "none" } : target;
}

export function desiredPage(task: TaskSnapshot, target: PageTarget, locale: Locale): SentPage {
  return {
    title: task.title,
    project: task.project,
    time: Object.keys(timeFieldIdsOf(target)).length > 0 ? timeValues(task, locale) : null,
    timeFieldsRevision: target.timeFieldSettings?.revision ?? null,
  };
}

export function importedPage(title: string, project: string | null, locale: Locale): SentPage {
  return {
    title,
    project,
    time: timeValues({ title, project, totalSec: 0, running: false, lastStartedAt: null }, locale),
  };
}

export function hasChanges(target: PageTarget, desired: SentPage, sent: SentPage): boolean {
  return (
    desired.title !== sent.title ||
    projectChanged(target, desired, sent) ||
    (desired.time !== null &&
      (desired.timeFieldsRevision !== (sent.timeFieldsRevision ?? null) ||
        !sameTime(target, desired.time, sent.time)))
  );
}

export function projectChanged(target: PageTarget, desired: SentPage, sent: SentPage): boolean {
  return target.projectMode !== "none" && desired.project !== sent.project;
}

export function usesMultiSelect(target: PageTarget): boolean {
  return target.projectMode === "property" && target.projectPropType === "multi_select";
}

export function sentOnUpdate(target: PageTarget, desired: SentPage, sent: SentPage): SentPage {
  return {
    title: desired.title,
    project: target.projectMode === "none" ? sent.project : desired.project,
    time: desired.time ?? sent.time,
    timeFieldsRevision: desired.timeFieldsRevision,
  };
}

export function changedPageProperties(
  target: PageTarget,
  desired: SentPage,
  sent: SentPage,
  currentMultiSelect: string[],
): PageProperties {
  const changed = projectChanged(target, desired, sent);
  const multiSelect = replaceProject(currentMultiSelect, sent.project, desired.project);
  return {
    ...(desired.title !== sent.title && titleProperty(target, desired.title)),
    ...(changed && projectProperty(target, desired.project, multiSelect)),
    ...timeProperties(target, desired.time),
  };
}

function timeValues(task: TaskSnapshot, locale: Locale): TimeValues {
  return {
    spentHours: Math.round((task.totalSec / SECONDS_PER_HOUR) * HOURS_PRECISION) / HOURS_PRECISION,
    spent: formatDuration(task.totalSec, locale),
    running: task.running,
    lastTracked: task.lastStartedAt,
  };
}

function sameTime(target: PageTarget, desired: TimeValues, sent: TimeValues | null): boolean {
  if (sent === null) return false;
  const ids = timeFieldIdsOf(target);
  return notionTimeFields.every(
    (field) => ids[field] === undefined || desired[field] === sent[field],
  );
}

function replaceProject(values: string[], previous: string | null, next: string | null): string[] {
  const kept = values.filter((value) => value !== previous && value !== next);
  return next === null ? kept : [...kept, next];
}

function titleProperty(target: PageTarget, title: string): PageProperties {
  return property(target.propertyIds.title, { title: [{ text: { content: title } }] });
}

function projectProperty(
  target: PageTarget,
  project: string | null,
  multiSelect: string[],
): PageProperties {
  const select = { select: project === null ? null : { name: project } };
  if (target.projectMode === "own") return property(target.propertyIds.project, select);
  if (target.projectMode === "none") return {};
  if (!usesMultiSelect(target)) return property(target.projectPropId, select);
  const options = multiSelect.map((name) => ({ name }));
  return property(target.projectPropId, { multi_select: options });
}

function timeProperties(target: PageTarget, time: TimeValues | null): PageProperties {
  if (time === null) return {};
  const ids = timeFieldIdsOf(target);
  return {
    ...property(ids.spentHours, { number: time.spentHours }),
    ...property(ids.spent, { rich_text: [{ text: { content: time.spent } }] }),
    ...property(ids.running, { checkbox: time.running }),
    ...property(ids.lastTracked, {
      date: time.lastTracked === null ? null : { start: time.lastTracked },
    }),
  };
}

function property(id: string | null | undefined, value: unknown): PageProperties {
  return id === null || id === undefined ? {} : { [id]: value };
}
