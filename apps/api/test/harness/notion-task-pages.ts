import type { TestSession } from "./api.ts";
import type { Locale } from "./notion-databases.ts";
import type { FakePage, PageValue } from "./notion-pages.ts";
import { linkPage, projectOfTask, type LinkBody } from "./notion-pull.ts";
import {
  SETUP_TIME,
  TASKS_DATABASE,
  TASK_TITLE,
  cronAt,
  loginForSync,
  type DatabaseSetup,
  type FakeNotionSync,
  type SyncedDatabase,
  type SyncedTask,
} from "./notion-sync.ts";
import { updateProject, type TestProject } from "./projects.ts";

export type NotionRecord = {
  title: string;
  values?: Record<string, PageValue>;
};

export type LinkedTask = {
  task: SyncedTask;
  page: FakePage;
};

export type UserWithTaskPage = LinkedTask & {
  session: TestSession;
  tasks: SyncedDatabase;
};

export async function linkedTask(
  fake: FakeNotionSync,
  session: TestSession,
  { dataSource }: SyncedDatabase,
  record: NotionRecord,
  body: LinkBody = {},
): Promise<LinkedTask> {
  const page = fake.pageInNotion(dataSource, { ...record, editedAt: SETUP_TIME });
  const task = await linkPage(session, page.id, body, SETUP_TIME);
  return { task, page };
}

export async function connectWithLinkedTask(
  fake: FakeNotionSync,
  session: TestSession,
  database: DatabaseSetup = TASKS_DATABASE,
): Promise<UserWithTaskPage> {
  const { tasks } = await fake.connectNotion(session, { databases: { tasks: database } });
  const linked = await linkedTask(fake, session, tasks, { title: TASK_TITLE });
  return { session, tasks, ...linked };
}

export async function userWithLinkedTask(
  fake: FakeNotionSync,
  database: DatabaseSetup = TASKS_DATABASE,
  locale: Locale = "ru",
): Promise<UserWithTaskPage> {
  return connectWithLinkedTask(fake, await loginForSync(locale), database);
}

export async function userWithTaskPage(
  fake: FakeNotionSync,
  database: DatabaseSetup = TASKS_DATABASE,
): Promise<UserWithTaskPage> {
  const user = await userWithLinkedTask(fake, database);
  await cronAt(SETUP_TIME);
  return user;
}

export async function projectBoundTo(
  fake: FakeNotionSync,
  session: TestSession,
  database: SyncedDatabase,
  name: string,
): Promise<TestProject> {
  const project = await newDatabaseProject(fake, session, database, "Привязка");
  return updateProject(session, project.id, { name }, SETUP_TIME);
}

export async function projectsBoundTo(
  fake: FakeNotionSync,
  session: TestSession,
  database: SyncedDatabase,
  names: string[],
): Promise<TestProject[]> {
  const archived: TestProject[] = [];
  for (const [index, name] of names.entries()) {
    const project = await newDatabaseProject(fake, session, database, `Привязка ${index + 1}`);
    archived.push(await updateProject(session, project.id, { name, archived: true }, SETUP_TIME));
  }
  const bound: TestProject[] = [];
  for (const project of archived) {
    bound.push(await updateProject(session, project.id, { archived: false }, SETUP_TIME));
  }
  return bound;
}

async function newDatabaseProject(
  fake: FakeNotionSync,
  session: TestSession,
  database: SyncedDatabase,
  title: string,
): Promise<TestProject> {
  const { task } = await linkedTask(fake, session, database, { title });
  const project = await projectOfTask(session, task.id, SETUP_TIME);
  if (project === null) throw new Error(`Linked task ${title} has no project`);
  return project;
}
