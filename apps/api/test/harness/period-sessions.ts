import { api, type TestResponse, type TestSession } from "./api.ts";
import { withQuery, type SessionOpts } from "./rest.ts";

export const MAX_PERIOD_SEC = 2_678_400;

export function listSessions(
  session: TestSession,
  query: Record<string, string>,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.get(withQuery("/api/sessions", query), { ...opts, as: session });
}

export function periodFrom(from: string, durationSec: number): { from: string; to: string } {
  const to = new Date(Date.parse(from) + durationSec * 1_000).toISOString();
  return { from, to };
}
