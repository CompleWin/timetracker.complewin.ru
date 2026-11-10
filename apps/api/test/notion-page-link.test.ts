import { beforeEach, describe, expect, it } from "vitest";
import { expectApiError, expectValidationError } from "./harness/assertions.ts";
import { atMinute } from "./harness/clock.ts";
import type { FakePage } from "./harness/notion-pages.ts";
import {
  fakeNotionPull,
  linkPage,
  optionsProperty,
  projectOfTask,
  projectsNamed,
  requestLink,
  selectValue,
  sendsProperty,
  userWithDatabase,
  type FakeNotionPull,
  type NotionOption,
  type UserWithDatabase,
} from "./harness/notion-pull.ts";
import {
  FUN_DATABASE,
  SETUP_TIME,
  TASKS_DATABASE,
  cronAt,
  pagePropertiesOf,
  propertyNamed,
  richTextValue,
  titlePropertyId,
  trackerPropertyId,
  type DatabaseSetup,
} from "./harness/notion-sync.ts";
import { projectsBoundTo } from "./harness/notion-task-pages.ts";
import { onlyCall } from "./harness/notion.ts";
import { createProject } from "./harness/projects.ts";

const AREA = "Сфера";
const PAGE_TITLE = "Беговая дорожка";
const SPORT: NotionOption = { name: "Спорт", color: "green" };
const SPORT_LOWERCASE: NotionOption = { name: "спорт", color: "green" };
const PAGE_TIME = atMinute(1);
const LINK_TIME = atMinute(2);
const BY_AREA: DatabaseSetup = {
  ...TASKS_DATABASE,
  properties: [optionsProperty(AREA, "select", [SPORT, SPORT_LOWERCASE])],
  projectProperty: AREA,
};
const FUN_WITHOUT_PROJECT: DatabaseSetup = { ...FUN_DATABASE, projectMode: "none" };

let fake: FakeNotionPull;

beforeEach(() => {
  fake = fakeNotionPull();
});

function pageWithArea({ added }: UserWithDatabase, option: NotionOption): FakePage {
  const area = propertyNamed(added.dataSource, AREA);
  return fake.pageInNotion(added.dataSource, {
    title: PAGE_TITLE,
    editedAt: PAGE_TIME,
    values: { [area.id]: selectValue(option) },
  });
}

function plainPage({ added }: UserWithDatabase, title = PAGE_TITLE): FakePage {
  return fake.pageInNotion(added.dataSource, { title, editedAt: PAGE_TIME });
}

async function bindProjects(
  { session, added }: UserWithDatabase,
  names: string[],
): Promise<string[]> {
  const projects = await projectsBoundTo(fake, session, added, names);
  return projects.map(({ id }) => id);
}

describe("проект из значения в Notion", () => {
  it("5. select-значение «Спорт» без такого проекта: ответ 201, задача в этой базе и в новом проекте «Спорт» с цветом варианта", async () => {
    const user = await userWithDatabase(fake, BY_AREA);
    const page = pageWithArea(user, SPORT);
    const response = await requestLink(user.session, page.id, {}, LINK_TIME);

    expect(response).toMatchObject({
      status: 201,
      body: {
        task: {
          title: PAGE_TITLE,
          notionPageUrl: page.url,
          notionDatabaseId: user.added.database.id,
        },
      },
    });
    expect(await projectOfTask(user.session, response.body.task.id, LINK_TIME)).toMatchObject({
      name: SPORT.name,
      color: SPORT.color,
    });
  });

  it("6. значение «спорт» при существующем проекте «Спорт»: задача в нём, новый проект не создаётся", async () => {
    const user = await userWithDatabase(fake, BY_AREA);
    const sport = await createProject(user.session, { name: SPORT.name }, SETUP_TIME);
    const task = await linkPage(
      user.session,
      pageWithArea(user, SPORT_LOWERCASE).id,
      {},
      LINK_TIME,
    );

    expect(task).toMatchObject({ projectId: sport.id });
    expect(await projectsNamed(user.session, SPORT.name, LINK_TIME)).toHaveLength(1);
  });

  it("7. projectId в теле побеждает значение из Notion", async () => {
    const user = await userWithDatabase(fake, BY_AREA);
    const work = await createProject(user.session, { name: "Работа" }, SETUP_TIME);
    const page = pageWithArea(user, SPORT);
    const task = await linkPage(user.session, page.id, { projectId: work.id }, LINK_TIME);

    expect(task).toMatchObject({ projectId: work.id });
    expect(await projectsNamed(user.session, SPORT.name, LINK_TIME)).toEqual([]);
  });
});

describe("проект из привязки к базе", () => {
  it("8. режим none, к базе привязан ровно один проект «Развлечения»: задача попадает в него", async () => {
    const user = await userWithDatabase(fake, FUN_WITHOUT_PROJECT);
    const [funId] = await bindProjects(user, ["Развлечения"]);
    const task = await linkPage(user.session, plainPage(user, "Ведьмак").id, {}, LINK_TIME);

    expect(task).toMatchObject({ projectId: funId });
  });

  it("8. режим none, к базе привязаны два проекта: задача попадает в проект с названием базы", async () => {
    const user = await userWithDatabase(fake, FUN_WITHOUT_PROJECT);
    const [funId] = await bindProjects(user, ["Развлечения", "Кино"]);
    const task = await linkPage(user.session, plainPage(user, "Ведьмак").id, {}, LINK_TIME);

    expect(task).toMatchObject({ projectId: funId });
  });
});

describe("ошибки link", () => {
  it("9. повторный link той же страницы даёт 409 already_linked с details.taskId", async () => {
    const user = await userWithDatabase(fake);
    const page = plainPage(user);
    const task = await linkPage(user.session, page.id, {}, LINK_TIME);
    const response = await requestLink(user.session, page.id, {}, atMinute(3));

    expectApiError(response, "already_linked");
    expect(response.body).toMatchObject({ error: { details: { taskId: task.id } } });
  });

  it("10. страница не из добавленных баз даёт 400 с полем pageId", async () => {
    const user = await userWithDatabase(fake);
    const elsewhere = fake.workspace.dataSource({ title: ["Чужая база"] });
    const page = fake.pageInNotion(elsewhere, { title: PAGE_TITLE, editedAt: PAGE_TIME });

    expectValidationError(await requestLink(user.session, page.id, {}, LINK_TIME), ["pageId"]);
  });

  it("10. страница из корзины даёт 400 с полем pageId", async () => {
    const user = await userWithDatabase(fake);
    const page = plainPage(user);
    fake.pages.trash(page);

    expectValidationError(await requestLink(user.session, page.id, {}, LINK_TIME), ["pageId"]);
  });
});

describe("синк связанной страницы", () => {
  it("11. после link и cron по странице уходит PATCH со своими полями, а title не отправляется", async () => {
    const user = await userWithDatabase(fake);
    const source = user.added.dataSource;
    const page = plainPage(user);
    await linkPage(user.session, page.id, {}, LINK_TIME);
    const update = onlyCall(await fake.updatesDuring(page, () => cronAt(LINK_TIME)));

    expect(fake.pages.creations()).toEqual([]);
    expect(pagePropertiesOf(update)).toMatchObject({
      [trackerPropertyId(source, "spentHours")]: { number: 0 },
      [trackerPropertyId(source, "spent")]: richTextValue("0 мин"),
      [trackerPropertyId(source, "running")]: { checkbox: false },
      [trackerPropertyId(source, "lastTracked")]: { date: null },
    });
    expect(sendsProperty(update, titlePropertyId(source))).toBe(false);
  });
});
