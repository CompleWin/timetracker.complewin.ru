import { z } from "zod";

export const isoDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
