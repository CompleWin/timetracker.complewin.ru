import type { Opts, TestResponse } from "./api.ts";

export type SessionOpts = Omit<Opts, "as">;

export const MISSING_ID = "00000000-0000-4000-8000-000000000000";

export function requireStatus(
  response: TestResponse,
  status: number,
  request: string,
): TestResponse {
  if (response.status !== status) {
    throw new Error(`${request} answered ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response;
}

export function withQuery(path: string, query: Record<string, string>): string {
  const search = new URLSearchParams(query).toString();
  return search === "" ? path : `${path}?${search}`;
}
