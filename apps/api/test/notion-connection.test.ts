import { beforeEach, describe, expect, it } from "vitest";
import { addDatabase } from "./harness/notion-databases.ts";
import { fakeNotionWorkspace, type FakeNotionWorkspace } from "./harness/notion-workspace.ts";
import {
  disconnectNotion,
  expectConnection,
  fakeNotion,
  getNotionConnection,
  loginWithNotion,
  notionWorkspace,
  otherNotionWorkspace,
  type FakeNotion,
} from "./harness/notion.ts";
import { loginAs } from "./harness/session.ts";

let notion: FakeNotion;
let workspace: FakeNotionWorkspace;

beforeEach(() => {
  notion = fakeNotion();
  workspace = fakeNotionWorkspace();
});

describe("GET /api/notion/connection", () => {
  it("8. без подключения возвращает connection: null", async () => {
    const { session } = await loginAs();

    expectConnection(await getNotionConnection(session), null);
  });
});

describe("DELETE /api/notion/connection", () => {
  it("8. DELETE возвращает 204, после чего GET возвращает connection: null", async () => {
    const { session } = await loginWithNotion(notion);

    expect(await disconnectNotion(session)).toMatchObject({ status: 204 });
    expectConnection(await getNotionConnection(session), null);
  });
});

describe("базы после переподключения", () => {
  it("9. после отключения и повторного подключения того же workspace добавленные базы на месте", async () => {
    const { session } = await loginWithNotion(notion);
    const database = await addDatabase(session, workspace.dataSource());
    await disconnectNotion(session);
    await notion.connect(session, notionWorkspace);

    expectConnection(await getNotionConnection(session), {
      workspaceId: notionWorkspace.id,
      databases: [database],
    });
  });

  it("9. подключение другого workspace делает список баз пустым", async () => {
    const { session } = await loginWithNotion(notion);
    await addDatabase(session, workspace.dataSource());
    await notion.connect(session, otherNotionWorkspace);

    expectConnection(await getNotionConnection(session), {
      workspaceId: otherNotionWorkspace.id,
      databases: [],
    });
  });
});
