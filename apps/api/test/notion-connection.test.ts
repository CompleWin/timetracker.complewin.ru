import { beforeEach, describe, expect, it } from "vitest";
import {
  disconnectNotion,
  expectConnection,
  fakeNotion,
  getNotionConnection,
  loginWithNotion,
  type FakeNotion,
} from "./harness/notion.ts";
import { loginAs } from "./harness/session.ts";

let notion: FakeNotion;

beforeEach(() => {
  notion = fakeNotion();
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
  it.todo(
    "9. после отключения и повторного подключения того же workspace добавленные базы на месте",
  );

  it.todo("9. подключение другого workspace делает список баз пустым");
});
