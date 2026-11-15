import { z } from "zod";
import { isoDateTime } from "./time.ts";

const hiddenGapSchema = z.object({ startedAt: z.string(), endedAt: z.string() });

export const hideGapBody = z
  .object({ startedAt: isoDateTime, endedAt: isoDateTime })
  .refine(({ startedAt, endedAt }) => Date.parse(startedAt) < Date.parse(endedAt), {
    path: ["endedAt"],
    message: "Must be later than startedAt",
    when: ({ issues }) => issues.length === 0,
  });

export type HiddenGap = z.infer<typeof hiddenGapSchema>;

export const hiddenGapsResponse = z.object({ hiddenGaps: z.array(hiddenGapSchema) });
