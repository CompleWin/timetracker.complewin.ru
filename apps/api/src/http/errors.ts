import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode = "validation_error" | "forbidden" | "not_found" | "internal_error";

export type FieldErrors = Record<string, string>;

type ErrorDetails = {
  fields?: FieldErrors;
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

export const forbidden = () =>
  new ApiError(403, "forbidden", "Cross-origin request is not allowed");

export const notFound = () => new ApiError(404, "not_found", "Resource not found");

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
