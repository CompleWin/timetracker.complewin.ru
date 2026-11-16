import type { HiddenGap, PeriodQuery } from "@stt/shared";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { hiddenGaps } from "../db/schema.ts";

export async function listHiddenGaps(
  db: Database,
  userId: string,
  { from, to }: PeriodQuery,
): Promise<HiddenGap[]> {
  const rows = await db
    .select({ startedAt: hiddenGaps.startedAt, endedAt: hiddenGaps.endedAt })
    .from(hiddenGaps)
    .where(
      and(
        eq(hiddenGaps.userId, userId),
        gte(hiddenGaps.startedAt, new Date(from)),
        lt(hiddenGaps.startedAt, new Date(to)),
      ),
    )
    .orderBy(asc(hiddenGaps.startedAt), asc(hiddenGaps.endedAt));
  return rows.map(({ startedAt, endedAt }) => ({
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  }));
}

export async function hideGap(
  db: Database,
  userId: string,
  { startedAt, endedAt }: HiddenGap,
): Promise<void> {
  await db
    .insert(hiddenGaps)
    .values({ userId, startedAt: new Date(startedAt), endedAt: new Date(endedAt) })
    .onConflictDoNothing();
}
