import { formatDuration, type Locale } from "@stt/shared";
import type { NotionDatabaseRow } from "../notion/databases.ts";

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
  "propertyIds" | "projectMode" | "projectPropId" | "projectPropType" | "timeProperties"
>;

export function desiredPage(task: TaskSnapshot, target: PageTarget, locale: Locale): SentPage {
  return {
    title: task.title,
    project: task.project,
    time: target.timeProperties ? timeValues(task, locale) : null,
  };
}

export function hasChanges(target: PageTarget, desired: SentPage, sent: SentPage): boolean {
  return (
    desired.title !== sent.title ||
    projectChanged(target, desired, sent) ||
    (desired.time !== null && !sameTime(desired.time, sent.time))
  );
}

export function projectChanged(target: PageTarget, desired: SentPage, sent: SentPage): boolean {
  return target.projectMode !== "none" && desired.project !== sent.project;
}

export function usesMultiSelect(target: PageTarget): boolean {
  return target.projectMode === "property" && target.projectPropType === "multi_select";
}

export function sentOnCreate(target: PageTarget, desired: SentPage): SentPage {
  return { ...desired, project: target.projectMode === "none" ? null : desired.project };
}

export function sentOnUpdate(target: PageTarget, desired: SentPage, sent: SentPage): SentPage {
  return {
    title: desired.title,
    project: target.projectMode === "none" ? sent.project : desired.project,
    time: desired.time ?? sent.time,
  };
}

export function newPageProperties(target: PageTarget, desired: SentPage): PageProperties {
  const multiSelect = desired.project === null ? [] : [desired.project];
  return {
    ...titleProperty(target, desired.title),
    ...projectProperty(target, desired.project, multiSelect),
    ...timeProperties(target, desired.time),
  };
}

export function changedPageProperties(
  target: PageTarget,
  desired: SentPage,
  sent: SentPage,
  currentMultiSelect: string[],
): PageProperties {
  const multiSelect = projectChanged(target, desired, sent)
    ? replaceProject(currentMultiSelect, sent.project, desired.project)
    : undefined;
  return {
    ...(desired.title !== sent.title && titleProperty(target, desired.title)),
    ...projectProperty(target, desired.project, multiSelect),
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

function sameTime(desired: TimeValues, sent: TimeValues | null): boolean {
  return (
    sent !== null &&
    desired.spentHours === sent.spentHours &&
    desired.spent === sent.spent &&
    desired.running === sent.running &&
    desired.lastTracked === sent.lastTracked
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
  multiSelect: string[] | undefined,
): PageProperties {
  const select = { select: project === null ? null : { name: project } };
  if (target.projectMode === "own") return property(target.propertyIds.project, select);
  if (target.projectMode === "none") return {};
  if (!usesMultiSelect(target)) return property(target.projectPropId, select);
  if (multiSelect === undefined) return {};
  const options = multiSelect.map((name) => ({ name }));
  return property(target.projectPropId, { multi_select: options });
}

function timeProperties(target: PageTarget, time: TimeValues | null): PageProperties {
  if (time === null) return {};
  const ids = target.propertyIds;
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
