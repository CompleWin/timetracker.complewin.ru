import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "name_taken"
  | "already_running"
  | "not_running"
  | "task_archived"
  | "too_many_running"
  | "overlap"
  | "internal_error";

export type FieldErrors = Record<string, string>;

type ErrorDetails = {
  fields?: FieldErrors;
  sessionId?: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
  }
}

export const validationError = (fields: FieldErrors) =>
  new ApiError(400, "validation_error", "Request validation failed", { fields });

export const unauthorized = () => new ApiError(401, "unauthorized", "Authentication required");

export const forbidden = () =>
  new ApiError(403, "forbidden", "Cross-origin request is not allowed");

export const notFound = () => new ApiError(404, "not_found", "Resource not found");

export const nameTaken = () =>
  new ApiError(409, "name_taken", "A project with this name already exists");

export const alreadyRunning = (sessionId: string) =>
  new ApiError(409, "already_running", "The task timer is already running", { sessionId });

export const notRunning = () => new ApiError(409, "not_running", "The timer is not running");

export const taskArchived = () =>
  new ApiError(409, "task_archived", "The task or its project is archived");

export const tooManyRunning = () =>
  new ApiError(409, "too_many_running", "Too many timers are running");

export const overlap = (sessionId: string) =>
  new ApiError(409, "overlap", "The session overlaps another session of this task", { sessionId });

const internalError = () => new ApiError(500, "internal_error", "Internal server error");

export function handleError(error: Error, c: Context): Response {
  const apiError = toApiError(error);
  return c.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details && { details: apiError.details }),
      },
    },
    apiError.status,
  );
}

function toApiError(error: Error): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof HTTPException && error.status === 400) {
    return new ApiError(400, "validation_error", error.message);
  }
  console.error(error);
  return internalError();
}
