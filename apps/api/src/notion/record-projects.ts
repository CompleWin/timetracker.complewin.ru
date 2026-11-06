import { PROJECT_NAME_MAX_LENGTH, t, type Locale } from "@stt/shared";
import type { Database } from "../db/client.ts";
import {
  activeProjects,
  bindProjectToDatabase,
  createProject,
  sameProjectName,
  type NewProject,
  type ProjectRef,
} from "../projects/projects.ts";
import type { NotionDatabaseRow } from "./databases.ts";
import { chosenOption, type NotionProjectValue } from "./page-projects.ts";

export type ProjectBook = {
  db: Database;
  owner: { id: string; locale: Locale };
  projects: ProjectRef[];
  now: Date;
};

export type RecordProject = {
  projectId: string;
  sentProject: string | null;
};

export async function openProjectBook(
  db: Database,
  owner: ProjectBook["owner"],
  now: Date,
): Promise<ProjectBook> {
  return { db, owner, projects: await activeProjects(db, owner.id), now };
}

export async function projectOfRecord(
  book: ProjectBook,
  value: NotionProjectValue,
  target: NotionDatabaseRow,
): Promise<RecordProject> {
  const option = chosenOption(value, book.projects);
  if (option === null) {
    return { projectId: (await projectWithoutValue(book, target)).id, sentProject: null };
  }
  const found = book.projects.find((project) => sameProjectName(project.name, option.name));
  const project = found ?? (await addProject(book, { ...option, notionDatabaseId: null }));
  return { projectId: project.id, sentProject: project.name };
}

export async function projectWithoutValue(
  book: ProjectBook,
  target: NotionDatabaseRow,
): Promise<ProjectRef> {
  const bound = book.projects.filter((project) => project.notionDatabaseId === target.id);
  const [only] = bound;
  return only !== undefined && bound.length === 1 ? only : databaseProject(book, target);
}

async function databaseProject(book: ProjectBook, target: NotionDatabaseRow): Promise<ProjectRef> {
  const name = databaseProjectName(target, book.owner.locale);
  const found = book.projects.find((project) => sameProjectName(project.name, name));
  if (found === undefined) {
    return addProject(book, { name, color: "default", notionDatabaseId: target.id });
  }
  if (found.notionDatabaseId === null) {
    await bindProjectToDatabase(book.db, found.id, target.id, book.now);
    found.notionDatabaseId = target.id;
  }
  return found;
}

function databaseProjectName(target: NotionDatabaseRow, locale: Locale): string {
  const name = target.title.trim().slice(0, PROJECT_NAME_MAX_LENGTH).trim();
  return name === "" ? t(locale, "notion.untitled") : name;
}

async function addProject(book: ProjectBook, project: NewProject): Promise<ProjectRef> {
  const created = await createProject(book.db, book.owner.id, project, book.now);
  book.projects.push(created);
  return created;
}
