import { z } from "zod";

export const isoDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const PERIOD_MAX_SEC = 31 * 24 * 60 * 60;

const MS_PER_SECOND = 1000;

export const periodQuery = z
  .object({ from: isoDateTime, to: isoDateTime })
  .refine(({ from, to }) => isValidPeriod(Date.parse(from), Date.parse(to)), {
    path: ["to"],
    message: "Must be later than from and at most 31 days after it",
  });

export type PeriodQuery = z.infer<typeof periodQuery>;

function isValidPeriod(fromMs: number, toMs: number): boolean {
  return toMs > fromMs && toMs - fromMs <= PERIOD_MAX_SEC * MS_PER_SECOND;
}
