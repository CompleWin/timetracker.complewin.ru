type Handler = (request: Request) => Response | Promise<Response>;

type UrlPattern = string | RegExp;

type Route = {
  method: string;
  url: UrlPattern;
  handler: Handler;
};

export type ExternalCall = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type CallFilter = {
  method?: string;
  url?: UrlPattern;
};

const routes: Route[] = [];
const recordedCalls: ExternalCall[] = [];
const unhandledCalls: ExternalCall[] = [];

export const external = {
  on(method: string, url: UrlPattern, handler: Handler): void {
    routes.push({ method: method.toUpperCase(), url, handler });
  },
  calls(filter: CallFilter = {}): ExternalCall[] {
    return recordedCalls.filter((call) => matches(filter, call));
  },
};

export async function interceptFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const call = await describeCall(request);
  recordedCalls.push(call);
  const route = routes.findLast((candidate) => matches(candidate, call));
  if (route) return route.handler(request);
  unhandledCalls.push(call);
  throw new Error(unhandledMessage([call]));
}

export function resetExternal(): void {
  routes.length = 0;
  recordedCalls.length = 0;
  unhandledCalls.length = 0;
}

export function assertAllExternalHandled(): void {
  if (unhandledCalls.length > 0) throw new Error(unhandledMessage(unhandledCalls));
}

async function describeCall(request: Request): Promise<ExternalCall> {
  return {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
    body: await request.clone().text(),
  };
}

function matches(filter: CallFilter, call: ExternalCall): boolean {
  return matchesMethod(filter.method, call.method) && matchesUrl(filter.url, call.url);
}

function matchesMethod(expected: string | undefined, actual: string): boolean {
  return expected === undefined || expected.toUpperCase() === actual;
}

function matchesUrl(expected: UrlPattern | undefined, actual: string): boolean {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) return expected.test(actual);
  return actual === expected || withoutQuery(actual) === expected;
}

function withoutQuery(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

function unhandledMessage(calls: ExternalCall[]): string {
  const list = calls.map((call) => `  ${call.method} ${call.url}`).join("\n");
  return `Unhandled external request:\n${list}\nRegister a handler with external.on(method, url, handler).`;
}
