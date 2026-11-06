import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "./client.ts";

const MAX_IDS_PER_QUERY = 90;

export function idChunks(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += MAX_IDS_PER_QUERY) {
    chunks.push(ids.slice(start, start + MAX_IDS_PER_QUERY));
  }
  return chunks;
}

export async function runAll(db: Database, statements: BatchItem<"sqlite">[]): Promise<void> {
  const [first, ...rest] = statements;
  if (first !== undefined) await db.batch([first, ...rest]);
}
