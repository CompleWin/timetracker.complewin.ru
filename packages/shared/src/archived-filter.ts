import { z } from "zod";

export const archivedFilter = z.enum(["false", "true", "all"]).default("false");

export type ArchivedFilter = z.infer<typeof archivedFilter>;
