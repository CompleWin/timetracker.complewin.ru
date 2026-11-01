import { beforeEach, describe, expect, it } from "vitest";
import { api, testEnv } from "./harness/index.ts";
import { expectRedirect } from "./harness/redirect.ts";
import {
  fakeTelegram,
  startPath,
  TELEGRAM_CALLBACK_URL,
  telegramEndpoints,
  type FakeTelegram,
} from "./harness/telegram.ts";

const RANDOM_128_BITS_BASE64URL = /^[A-Za-z0-9_-]{22,}$/;
const SHA256_BASE64URL = /^[A-Za-z0-9_-]{43}$/;
const unsafeReturnTos = ["https://evil.example", "//evil.example", "/\\evil.example", "tasks/1"];

let telegram: FakeTelegram;

beforeEach(async () => {
  telegram = await fakeTelegram();
});

async function authorizationRedirect(): Promise<URL> {
  const response = await api.get(startPath("/"));
  expect(response.status).toBe(302);
  return new URL(response.headers.get("Location") ?? "", testEnv.APP_URL);
}

function endpointOf(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

describe("GET /auth/telegram/start", () => {
  it("1. отвечает 302 на authorization_endpoint со всеми параметрами из таблицы", async () => {
    const url = await authorizationRedirect();

    expect(endpointOf(url)).toBe(telegramEndpoints.authorization);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: testEnv.TG_CLIENT_ID,
      redirect_uri: TELEGRAM_CALLBACK_URL,
      response_type: "code",
      state: expect.stringMatching(RANDOM_128_BITS_BASE64URL),
      nonce: expect.stringMatching(RANDOM_128_BITS_BASE64URL),
      code_challenge: expect.stringMatching(SHA256_BASE64URL),
      code_challenge_method: "S256",
    });
  });

  it("1. scope содержит openid, profile и telegram:bot_access", async () => {
    const url = await authorizationRedirect();

    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining(["openid", "profile", "telegram:bot_access"]),
    );
  });

  it.each(["state", "nonce", "code_challenge"])("1. каждый start выдаёт новый %s", async (name) => {
    const first = await authorizationRedirect();
    const second = await authorizationRedirect();

    expect(second.searchParams.get(name)).not.toBe(first.searchParams.get(name));
  });
});

describe("returnTo", () => {
  it("2. после успешного входа редирект идёт на returnTo /tasks/1", async () => {
    const response = await telegram.callback(await telegram.start("/tasks/1"));

    expectRedirect(response, "/tasks/1");
  });

  it.each(unsafeReturnTos)(
    "2. при returnTo %s редирект после входа идёт на /",
    async (returnTo) => {
      const response = await telegram.callback(await telegram.start(returnTo));

      expectRedirect(response, "/");
    },
  );

  it("2. без returnTo редирект после входа идёт на /", async () => {
    const response = await telegram.callback(await telegram.start());

    expectRedirect(response, "/");
  });
});
