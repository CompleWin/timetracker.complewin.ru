import { afterEach, beforeEach, vi } from "vitest";
import { resetDatabase } from "./db.ts";
import { assertAllExternalHandled, interceptFetch, resetExternal } from "./external.ts";

vi.stubGlobal("fetch", interceptFetch);

beforeEach(async () => {
  resetExternal();
  await resetDatabase();
});

afterEach(() => {
  assertAllExternalHandled();
});
