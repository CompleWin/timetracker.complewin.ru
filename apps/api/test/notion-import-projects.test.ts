import { beforeEach, describe, expect, it } from "vitest";
import type { TestSession } from "./harness/index.ts";
import type { Locale } from "./harness/notion-databases.ts";
import {
  EDIT_AFTER_IMPORT,
  IMPORT_RUN,
  NEXT_RUN,
  TASKS_BASE,
  TASKS_TITLE,
  activeTasks,
  filterOf,
  onlyProjectNamed,
  pageIn,
  projectOfPage,
  taskOfPage,
} from "./harness/notion-import.ts";
import type { FakePage, PageValue } from "./harness/notion-pages.ts";
import {
  fakeNotionPull,
  linkPage,
  multiSelectValue,
  optionsProperty,
  projectOfTask,
  projectsNamed,
  queryBodyOf,
  queryUrlOf,
  selectValue,
  userWithDatabase,
  type FakeNotionPull,
  type NotionOption,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import {
  FUN_DATABASE,
  SETUP_TIME,
  cronAt,
  loginForSync,
  pagePropertiesOf,
  propertyNamed,
  trackerPropertyId,
  type DatabaseSetup,
  type SyncedDatabase,
} from "./harness/notion-sync.ts";
import { projectBoundTo, projectsBoundTo } from "./harness/notion-task-pages.ts";
import { onlyCall } from "./harness/notion.ts";
import { archiveProject, createProject, updateProject } from "./harness/projects.ts";

const AREA = "Сфера";
const SPORT: NotionOption = { name: "Спорт", color: "green" };
const LOWERCASE_TASKS: NotionOption = { name: "tasks", color: "blue" };
const BY_OWN_FIELD: DatabaseSetup = { title: TASKS_TITLE };
const BY_SELECT: DatabaseSetup = {
  title: TASKS_TITLE,
  properties: [optionsProperty(AREA, "select", [SPORT, LOWERCASE_TASKS])],
  projectProperty: AREA,
};
const BY_MULTI_SELECT: DatabaseSetup = {
  title: TASKS_TITLE,
  properties: [{ name: AREA, type: "multi_select" }],
  projectProperty: AREA,
};

type FieldOf = (database: SyncedDatabase) => string;

const projectFields: [string, DatabaseSetup, FieldOf][] = [
  ["own", BY_OWN_FIELD, ({ dataSource }) => trackerPropertyId(dataSource, "project")],
  ["property", BY_SELECT, ({ dataSource }) => propertyNamed(dataSource, AREA).id],
];

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

async function bindProjects({ session, added }: UserWithDatabase, names: string[]): Promise<void> {
  await projectsBoundTo(fake, session, added, names);
}

async function importedProjectName(
  { session }: UserWithDatabase,
  page: FakePage,
): Promise<string | undefined> {
  await cronAt(IMPORT_RUN);
  return (await projectOfPage(session, page, IMPORT_RUN))?.name;
}

function pageWithValue(
  user: UserWithDatabase,
  fieldId: string,
  value: PageValue,
  title = "Беговая дорожка",
): FakePage {
  return pageIn(fake, user.added, title, { [fieldId]: value });
}

describe("первый проход базы Tasks в режиме none", () => {
  it("4. query уходит без filter, с сортировкой по возрастанию и page_size 100", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    pageIn(fake, user.added, "Anki");
    const query = onlyCall(await fake.queriesDuring(() => cronAt(IMPORT_RUN)));

    expect(query.url).toBe(queryUrlOf(user.added.dataSource));
    expect(filterOf(query)).toBeUndefined();
    expect(queryBodyOf(query)).toMatchObject({
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: 100,
    });
  });

  it("4. создан проект Tasks с color = default и notionDatabaseId этой базы", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    pageIn(fake, user.added, "Anki");
    await cronAt(IMPORT_RUN);

    expect(await onlyProjectNamed(user.session, TASKS_TITLE, IMPORT_RUN)).toMatchObject({
      name: TASKS_TITLE,
      color: "default",
      notionDatabaseId: user.added.database.id,
    });
  });

  it("4. в проекте Tasks три задачи со страницами, закреплённые за базой, таймеры не идут", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    const pages = ["Anki", "Отчёт", "Шахматы"].map((title) => pageIn(fake, user.added, title));
    await cronAt(IMPORT_RUN);
    const project = await onlyProjectNamed(user.session, TASKS_TITLE, IMPORT_RUN);

    expect(await activeTasks(user.session, IMPORT_RUN)).toHaveLength(pages.length);
    for (const page of pages) {
      expect(await taskOfPage(user.session, page, IMPORT_RUN)).toMatchObject({
        projectId: project.id,
        notionDatabaseId: user.added.database.id,
        runningSessionId: null,
      });
    }
  });
});

describe("проект из значения в Notion", () => {
  it.each(projectFields)(
    "6. режим %s: страница со значением «Спорт» попадает в проект «Спорт» с цветом варианта",
    async (_, database, fieldOf) => {
      const user = await userWithDatabase(fake, database);
      const page = pageWithValue(user, fieldOf(user.added), selectValue(SPORT));
      await cronAt(IMPORT_RUN);

      expect(await projectOfPage(user.session, page, IMPORT_RUN)).toMatchObject({
        name: SPORT.name,
        color: SPORT.color,
      });
    },
  );

  it.each(projectFields)(
    "6. режим %s: страница с пустым полем попадает в проект с названием базы",
    async (_, database, fieldOf) => {
      const user = await userWithDatabase(fake, database);
      const page = pageWithValue(user, fieldOf(user.added), selectValue(null));

      expect(await importedProjectName(user, page)).toBe(TASKS_TITLE);
    },
  );

  it("6. режим property с multi_select: берётся первое значение, совпадающее с неархивным проектом", async () => {
    const user = await userWithDatabase(fake, BY_MULTI_SELECT);
    const fieldId = propertyNamed(user.added.dataSource, AREA).id;
    await createProject(user.session, { name: SPORT.name }, SETUP_TIME);
    const page = pageWithValue(user, fieldId, multiSelectValue(["SFEDU", SPORT.name]));

    expect(await importedProjectName(user, page)).toBe(SPORT.name);
  });
});

describe("проект с названием базы", () => {
  it("7. проект Tasks уже есть и ни к чему не привязан: новый не создаётся, задачи в нём, проект привязывается к базе", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    const tasks = await createProject(user.session, { name: TASKS_TITLE }, SETUP_TIME);
    const page = pageIn(fake, user.added, "Anki");
    await cronAt(IMPORT_RUN);

    expect(await taskOfPage(user.session, page, IMPORT_RUN)).toMatchObject({
      projectId: tasks.id,
    });
    expect(await onlyProjectNamed(user.session, TASKS_TITLE, IMPORT_RUN)).toMatchObject({
      id: tasks.id,
      notionDatabaseId: user.added.database.id,
    });
  });

  it("7. название базы сравнивается с проектом без учёта регистра", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    const lowercase = await createProject(user.session, { name: "tasks" }, SETUP_TIME);
    const page = pageIn(fake, user.added, "Anki");
    await cronAt(IMPORT_RUN);

    expect(await taskOfPage(user.session, page, IMPORT_RUN)).toMatchObject({
      projectId: lowercase.id,
    });
    expect(await projectsNamed(user.session, TASKS_TITLE, IMPORT_RUN)).toHaveLength(1);
  });

  it("7. значение «tasks» из Notion находит проект Tasks в другом регистре", async () => {
    const user = await userWithDatabase(fake, BY_SELECT);
    const tasks = await createProject(user.session, { name: TASKS_TITLE }, SETUP_TIME);
    const fieldId = propertyNamed(user.added.dataSource, AREA).id;
    const page = pageWithValue(user, fieldId, selectValue(LOWERCASE_TASKS));
    await cronAt(IMPORT_RUN);

    expect(await taskOfPage(user.session, page, IMPORT_RUN)).toMatchObject({
      projectId: tasks.id,
    });
    expect(await projectsNamed(user.session, TASKS_TITLE, IMPORT_RUN)).toHaveLength(1);
  });

  it("7. проект с названием базы, привязанный к другой базе, используется без перепривязки", async () => {
    const session = await loginForSync();
    const { tasks, fun } = await fake.connectNotion(session, {
      databases: { tasks: TASKS_BASE, fun: FUN_DATABASE },
    });
    const bound = await projectBoundTo(fake, session, fun, TASKS_TITLE);
    const page = pageIn(fake, tasks, "Anki");
    await cronAt(IMPORT_RUN);

    expect(await taskOfPage(session, page, IMPORT_RUN)).toMatchObject({ projectId: bound.id });
    expect(await onlyProjectNamed(session, TASKS_TITLE, IMPORT_RUN)).toMatchObject({
      notionDatabaseId: fun.database.id,
    });
  });
});

describe("проект, привязанный к базе", () => {
  async function importedThenNewPage(user: UserWithDatabase): Promise<FakePage> {
    pageIn(fake, user.added, "Anki");
    await cronAt(IMPORT_RUN);
    return pageIn(fake, user.added, "Отчёт", {}, EDIT_AFTER_IMPORT);
  }

  it("8. проект переименован в «Работа»: новые страницы попадают в него, проект Tasks не создаётся", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    const page = await importedThenNewPage(user);
    const project = await onlyProjectNamed(user.session, TASKS_TITLE, IMPORT_RUN);
    await updateProject(user.session, project.id, { name: "Работа" }, IMPORT_RUN);
    await cronAt(NEXT_RUN);

    expect(await projectOfPage(user.session, page, NEXT_RUN)).toMatchObject({
      id: project.id,
      name: "Работа",
    });
    expect(await projectsNamed(user.session, TASKS_TITLE, NEXT_RUN)).toEqual([]);
  });

  it("8. проект базы отправлен в архив: следующая импортированная запись создаёт новый проект", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    const page = await importedThenNewPage(user);
    const archived = await onlyProjectNamed(user.session, TASKS_TITLE, IMPORT_RUN);
    await archiveProject(user.session, archived.id, IMPORT_RUN);
    await cronAt(NEXT_RUN);
    const created = await projectOfPage(user.session, page, NEXT_RUN);

    expect(created).toMatchObject({ name: TASKS_TITLE, archived: false });
    expect(created?.id).not.toBe(archived.id);
  });

  it("9. к базе привязаны два проекта, один из них с названием базы: задача попадает в него", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    await bindProjects(user, [TASKS_TITLE, "Кино"]);
    const page = pageIn(fake, user.added, "Anki");

    expect(await importedProjectName(user, page)).toBe(TASKS_TITLE);
    expect(await projectsNamed(user.session, TASKS_TITLE, IMPORT_RUN)).toHaveLength(1);
  });

  it("9. к базе привязаны два проекта с другими названиями: создаётся проект с названием базы", async () => {
    const user = await userWithDatabase(fake, TASKS_BASE);
    await bindProjects(user, ["Игры", "Кино"]);
    const page = pageIn(fake, user.added, "Anki");

    expect(await importedProjectName(user, page)).toBe(TASKS_TITLE);
  });
});

describe("link без projectId", () => {
  it("26. страница без значения поля, привязанных проектов нет: задача в новом проекте с названием базы", async () => {
    const user = await userWithDatabase(fake, BY_SELECT);
    const page = pageIn(fake, user.added, "Anki");
    const task = await linkPage(user.session, page.id, {}, IMPORT_RUN);

    expect(await projectOfTask(user.session, task.id, IMPORT_RUN)).toMatchObject({
      name: TASKS_TITLE,
      color: "default",
      notionDatabaseId: user.added.database.id,
    });
  });

  it("26. проект с названием базы при первом push записывается в Notion как обычный проект задачи", async () => {
    const user = await userWithDatabase(fake, BY_OWN_FIELD);
    const page = pageIn(fake, user.added, "Anki");
    await linkPage(user.session, page.id, {}, IMPORT_RUN);
    const update = onlyCall(await fake.updatesDuring(page, () => cronAt(IMPORT_RUN)));

    expect(pagePropertiesOf(update)).toMatchObject({
      [trackerPropertyId(user.added.dataSource, "project")]: { select: { name: TASKS_TITLE } },
    });
  });
});

describe("база с пустым названием", () => {
  async function importFromUntitledBase(
    locale: Locale,
  ): Promise<{ session: TestSession; page: FakePage }> {
    const session = await loginForSync(locale);
    const { untitled } = await fake.connectNotion(session, {
      databases: { untitled: { title: "", projectMode: "none" } },
    });
    const page = pageIn(fake, untitled, "Anki");
    await cronAt(IMPORT_RUN);
    return { session, page };
  }

  it.each<[Locale, string]>([
    ["ru", "Без названия"],
    ["en", "Untitled"],
  ])("27. у пользователя с locale %s проект называется «%s»", async (locale, name) => {
    const { session, page } = await importFromUntitledBase(locale);

    expect(await projectOfPage(session, page, IMPORT_RUN)).toMatchObject({ name });
  });
});
