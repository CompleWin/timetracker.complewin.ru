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
  | "notion_reauth_required"
  | "property_conflict"
  | "database_already_added"
  | "too_many_databases"
  | "already_linked"
  | "notion_unavailable"
  | "internal_error";

export type FieldErrors = Record<string, string>;

type ErrorDetails = {
  fields?: FieldErrors;
  sessionId?: string;
  name?: string;
  databaseId?: string;
  taskId?: string;
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

export const notionReauthRequired = () =>
  new ApiError(409, "notion_reauth_required", "Notion needs to be reconnected");

export const propertyConflict = (name: string) =>
  new ApiError(
    409,
    "property_conflict",
    "The database has a property of another type with our name",
    {
      name,
    },
  );

export const databaseAlreadyAdded = (databaseId: string) =>
  new ApiError(409, "database_already_added", "The database has already been added", {
    databaseId,
  });

export const tooManyDatabases = () =>
  new ApiError(409, "too_many_databases", "Too many Notion databases are added");

export const alreadyLinked = (taskId: string) =>
  new ApiError(409, "already_linked", "The Notion page is already linked to a task", { taskId });

export const notionUnavailable = () =>
  new ApiError(502, "notion_unavailable", "Notion did not answer or answered with a server error");

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
