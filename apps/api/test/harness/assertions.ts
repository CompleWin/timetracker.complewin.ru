import { expect } from "vitest";
import type { TestResponse } from "./api.ts";

const errorStatus = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  name_taken: 409,
  already_running: 409,
  not_running: 409,
  task_archived: 409,
  too_many_running: 409,
  overlap: 409,
  notion_reauth_required: 409,
  property_conflict: 409,
  database_already_added: 409,
  too_many_databases: 409,
  already_linked: 409,
  rate_limited: 429,
  notion_unavailable: 502,
} as const;

export type ErrorCode = keyof typeof errorStatus;

export const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function expectApiError(response: TestResponse, code: ErrorCode): void {
  expect(response).toMatchObject({
    status: errorStatus[code],
    body: { error: { code, message: expect.stringMatching(/\S/) } },
  });
}

export function expectValidationError(response: TestResponse, fields: string[]): void {
  expectApiError(response, "validation_error");
  const reportedFields = Object.fromEntries(fields.map((field) => [field, expect.anything()]));
  expect(response.body).toMatchObject({ error: { details: { fields: reportedFields } } });
}
