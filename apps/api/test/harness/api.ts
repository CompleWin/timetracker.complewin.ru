import { exports as workerExports } from "cloudflare:workers";
import { testEnv } from "./test-env.ts";

export const SESSION_COOKIE = "stt_session";

export type TestSession = {
  cookie: string;
};

export type Opts = {
  as?: TestSession;
  now?: string;
  headers?: Record<string, string>;
};

export type TestResponse = {
  status: number;
  headers: Headers;
  body: any;
  cookies: Record<string, string>;
};

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export const api = {
  get: (path: string, opts?: Opts) => send("GET", path, undefined, opts),
  post: (path: string, body?: unknown, opts?: Opts) => send("POST", path, body, opts),
  patch: (path: string, body?: unknown, opts?: Opts) => send("PATCH", path, body, opts),
  put: (path: string, body?: unknown, opts?: Opts) => send("PUT", path, body, opts),
  delete: (path: string, opts?: Opts) => send("DELETE", path, undefined, opts),
};

async function send(
  method: Method,
  path: string,
  body: unknown,
  opts: Opts = {},
): Promise<TestResponse> {
  const response = await workerExports.default.fetch(new URL(path, testEnv.APP_URL), {
    method,
    headers: requestHeaders(body, opts),
    body: encodeBody(body),
    redirect: "manual",
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await decodeBody(response),
    cookies: readCookies(response.headers),
  };
}

function requestHeaders(body: unknown, { as, now, headers }: Opts): Headers {
  const result = new Headers(headers);
  if (as) result.set("Cookie", `${SESSION_COOKIE}=${as.cookie}`);
  if (now !== undefined) result.set("X-Test-Now", now);
  if (body !== undefined && !result.has("Content-Type")) {
    result.set("Content-Type", "application/json");
  }
  return result;
}

function encodeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  return typeof body === "string" ? body : JSON.stringify(body);
}

async function decodeBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  return isJson(response.headers) ? JSON.parse(text) : text;
}

function isJson(headers: Headers): boolean {
  return headers.get("Content-Type")?.includes("json") ?? false;
}

function readCookies(headers: Headers): Record<string, string> {
  const pairs = headers.getSetCookie().map((setCookie) => {
    const [pair = ""] = setCookie.split(";");
    const separator = pair.indexOf("=");
    return [pair.slice(0, separator).trim(), pair.slice(separator + 1).trim()];
  });
  return Object.fromEntries(pairs);
}
