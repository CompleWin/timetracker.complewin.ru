import { beforeEach, describe, expect, it } from "vitest";
import type { TestResponse, TestSession } from "./harness/index.ts";
import {
  checkNotionConnection,
  expectConnection,
  fakeNotion,
  getNotionConnection,
  loginWithNotion,
  tokensOf,
  type FakeNotion,
} from "./harness/notion.ts";
import { tablesContaining } from "./harness/storage.ts";

type ConnectionRequest = [string, (session: TestSession) => Promise<TestResponse>];

const connectionRequests: ConnectionRequest[] = [
  ["GET /api/notion/connection", getNotionConnection],
  ["POST /api/notion/connection/check", checkNotionConnection],
];

let notion: FakeNotion;

beforeEach(() => {
  notion = fakeNotion();
});

async function tablesContainingAny(texts: string[]): Promise<string[]> {
  const found = await Promise.all(texts.map(tablesContaining));
  return found.flat();
}

function jsonValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(jsonValues);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(jsonValues);
  return [value];
}

async function refreshTokensOnce(session: TestSession): Promise<void> {
  notion.expireAccessTokens();
  expectConnection(await checkNotionConnection(session), { status: "ok" });
}

describe("хранение токенов", () => {
  it("3. access_token и refresh_token из callback не встречаются ни в одной таблице D1", async () => {
    await loginWithNotion(notion);

    expect(await tablesContainingAny(tokensOf(notion.grants()))).toEqual([]);
  });

  it("3. access_token и refresh_token после обновления тоже не встречаются в D1", async () => {
    const { session } = await loginWithNotion(notion);
    await refreshTokensOnce(session);

    expect(notion.grants()).toHaveLength(2);
    expect(await tablesContainingAny(tokensOf(notion.grants()))).toEqual([]);
  });
});

describe("ответы API без токенов", () => {
  it.each(connectionRequests)(
    "5. ни одно значение в JSON ответа %s не совпадает с токенами",
    async (_, send) => {
      const { session } = await loginWithNotion(notion);
      const response = await send(session);

      expectConnection(response, { status: "ok" });
      for (const token of tokensOf(notion.grants())) {
        expect(jsonValues(response.body)).not.toContain(token);
      }
    },
  );
});
