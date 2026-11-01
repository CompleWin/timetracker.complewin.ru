import { validator } from "hono/validator";
import type { z } from "zod";
import { validationError, type FieldErrors } from "./errors.ts";

export function jsonBody<Schema extends z.ZodType>(schema: Schema) {
  return validator("json", (value): z.output<Schema> => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw validationError(fieldErrors(parsed.error));
    return parsed.data;
  });
}

function fieldErrors(error: z.ZodError): FieldErrors {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message]));
}
