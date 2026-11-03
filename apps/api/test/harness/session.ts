import { expect } from "vitest";
import { api, SESSION_COOKIE, type Opts, type TestResponse, type TestSession } from "./api.ts";

export type TestUser = {
  id: string;
  telegramId: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  timezone: string | null;
  locale: "ru" | "en";
  botCanMessage: boolean;
};

export type LoginAsInput = {
  telegramId?: number;
  name?: string;
  locale?: TestUser["locale"];
};

export type LoggedIn = {
  session: TestSession;
  user: TestUser;
};

export type SetCookie = {
  value: string;
  attributes: Record<string, string>;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SESSION_MAX_AGE_SEC = 2_592_000;

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}=?$/;

export async function loginAs(input: LoginAsInput = {}, opts?: Opts): Promise<LoggedIn> {
  const response = await api.post("/auth/dev-login", input, opts);
  if (response.status !== 200) {
    throw new Error(
      `POST /auth/dev-login answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return { session: sessionFrom(response), user: response.body.user };
}

export function sessionFrom(response: TestResponse): TestSession {
  const cookie = response.cookies[SESSION_COOKIE];
  if (!cookie) throw new Error(`Response ${response.status} sets no ${SESSION_COOKIE} cookie`);
  return { cookie };
}

export async function currentUser(session: TestSession): Promise<TestUser> {
  const response = await api.get("/api/me", { as: session });
  if (response.status !== 200) {
    throw new Error(`GET /api/me answered ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body.user;
}

export function sessionSetCookie(response: TestResponse): SetCookie | undefined {
  const header = response.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${SESSION_COOKIE}=`));
  if (header === undefined) return undefined;
  const [pair = "", ...attributes] = header.split(";").map((part) => part.trim());
  return {
    value: pair.slice(SESSION_COOKIE.length + 1),
    attributes: Object.fromEntries(attributes.map(parseAttribute)),
  };
}

export function expectSessionCookie(response: TestResponse): void {
  expect(sessionSetCookie(response)).toMatchObject({
    value: expect.stringMatching(SESSION_TOKEN),
    attributes: {
      httponly: "",
      secure: "",
      samesite: expect.stringMatching(/^lax$/i),
      path: "/",
      "max-age": String(SESSION_MAX_AGE_SEC),
    },
  });
}

export function expectNoSessionCookie(response: TestResponse): void {
  expect(response.cookies[SESSION_COOKIE] ?? "").toBe("");
}

function parseAttribute(attribute: string): [string, string] {
  const separator = attribute.indexOf("=");
  if (separator === -1) return [attribute.toLowerCase(), ""];
  return [
    attribute.slice(0, separator).trim().toLowerCase(),
    attribute.slice(separator + 1).trim(),
  ];
}
