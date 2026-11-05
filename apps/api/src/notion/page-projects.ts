import { sameProjectName, type ProjectRef } from "../projects/projects.ts";
import type { NotionDatabaseRow } from "./databases.ts";
import {
  multiSelectOptions,
  selectOption,
  type NotionOption,
  type NotionPageSnapshot,
} from "./pages.ts";

export type NotionProjectValue =
  | { kind: "single"; option: NotionOption | null }
  | { kind: "multiple"; options: NotionOption[] }
  | { kind: "absent" };

type ProjectSource = Pick<
  NotionDatabaseRow,
  "projectMode" | "projectPropId" | "projectPropType" | "propertyIds"
>;

export function projectValueOf(
  page: NotionPageSnapshot,
  database: ProjectSource,
): NotionProjectValue {
  if (database.projectMode === "none") return { kind: "absent" };
  if (database.projectMode === "own") {
    return { kind: "single", option: selectOption(page, database.propertyIds.project) };
  }
  if (database.projectPropType === "multi_select") {
    return { kind: "multiple", options: multiSelectOptions(page, database.projectPropId) };
  }
  return { kind: "single", option: selectOption(page, database.projectPropId) };
}

export function chosenOption(value: NotionProjectValue, active: ProjectRef[]): NotionOption | null {
  if (value.kind === "absent") return null;
  if (value.kind === "single") return value.option;
  const known = value.options.find((option) =>
    active.some((project) => sameProjectName(project.name, option.name)),
  );
  return known ?? value.options[0] ?? null;
}

export function changedInNotion(value: NotionProjectValue, sentProject: string | null): boolean {
  if (value.kind === "absent") return false;
  if (value.kind === "multiple") {
    return sentProject === null
      ? value.options.length > 0
      : !value.options.some((option) => sameProjectName(option.name, sentProject));
  }
  const current = value.option?.name ?? null;
  if (current === null || sentProject === null) return current !== sentProject;
  return !sameProjectName(current, sentProject);
}
