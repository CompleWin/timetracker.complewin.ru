import type { z } from "zod";

export function atLeastOneField<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  return schema.refine(
    (body) => Object.keys(body).length > 0,
    "At least one known field is required",
  );
}
