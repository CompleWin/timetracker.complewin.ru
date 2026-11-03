import { db } from "./db.ts";

export async function tablesContaining(text: string): Promise<string[]> {
  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'",
  );
  const matches: string[] = [];
  for (const { name } of tables) {
    const rows = await db.all(`SELECT * FROM "${name}"`);
    if (JSON.stringify(rows).includes(text)) matches.push(name);
  }
  return matches;
}
