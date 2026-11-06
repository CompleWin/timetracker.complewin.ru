import type { LinkNotionPageBody, Locale, Task } from "@stt/shared";
import { database, type Database } from "../db/client.ts";
import type { Bindings } from "../env.ts";
import { alreadyLinked, notFound, validationError } from "../http/errors.ts";
import { isActiveProject } from "../projects/projects.ts";
import { createTask } from "../tasks/tasks.ts";
import { notionClient, type NotionClient } from "./client.ts";
import { listNotionDatabaseRows, type NotionDatabaseRow } from "./databases.ts";
import type { NotionApiRequest } from "./http.ts";
import { requestNotionJson } from "./json-request.ts";
import { chosenOption, projectValueOf } from "./page-projects.ts";
import { linkedTaskIds, requirePagesConnection } from "./page-search.ts";
import {
  notionPageJsonSchema,
  pagePath,
  taskTitleOf,
  toPageSnapshot,
  type NotionPageSnapshot,
} from "./pages.ts";
import { openProjectBook, projectOfRecord, type RecordProject } from "./record-projects.ts";

type PageOwner = { id: string; locale: Locale };

const notLinkable = () => validationError({ pageId: "Expected a page of an added database" });

export async function linkNotionPage(
  env: Bindings,
  owner: PageOwner,
  pageId: string,
  body: LinkNotionPageBody,
  now: Date,
): Promise<Task> {
  const db = database(env);
  const connection = await requirePagesConnection(db, owner.id);
  const page = await retrievePage(notionClient(env, connection), pageId);
  const target = (await listNotionDatabaseRows(db, owner.id)).find(
    (row) => row.dataSourceId === page.dataSourceId,
  );
  if (target === undefined || page.inTrash) throw notLinkable();
  const linkedTaskId = (await linkedTaskIds(db, owner.id, [page.id])).get(page.id);
  if (linkedTaskId !== undefined) throw alreadyLinked(linkedTaskId);
  const title = taskTitleOf(page, target.propertyIds.title, owner.locale);
  const { projectId, sentProject } = await chooseProject(db, owner, page, target, body, now);
  return createTask(db, owner.id, { title, projectId }, now, {
    notionDatabaseId: target.id,
    notionPageId: page.id,
    notionPageUrl: page.url,
    notionSent: { title, project: sentProject, time: null },
  });
}

async function retrievePage(client: NotionClient, pageId: string): Promise<NotionPageSnapshot> {
  const request: NotionApiRequest = { method: "GET", path: pagePath(pageId) };
  const page = await requestNotionJson(client, request, notionPageJsonSchema);
  if (page === undefined) throw notFound();
  return toPageSnapshot(page);
}

async function chooseProject(
  db: Database,
  owner: PageOwner,
  page: NotionPageSnapshot,
  target: NotionDatabaseRow,
  body: LinkNotionPageBody,
  now: Date,
): Promise<RecordProject> {
  const book = await openProjectBook(db, owner, now);
  const value = projectValueOf(page, target);
  if (body.projectId === undefined) return projectOfRecord(book, value, target);
  const sentProject = chosenOption(value, book.projects)?.name ?? null;
  return { projectId: await requireOwnActiveProject(db, owner.id, body.projectId), sentProject };
}

async function requireOwnActiveProject(
  db: Database,
  userId: string,
  projectId: string,
): Promise<string> {
  if (!(await isActiveProject(db, userId, projectId))) {
    throw validationError({ projectId: "Expected an own active project" });
  }
  return projectId;
}
