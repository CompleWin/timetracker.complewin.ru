import { z } from "zod";
import type { NotionClient } from "./client.ts";
import { addDatabase, type DatabaseSetup } from "./database-setup.ts";
import { requestNotionJson } from "./json-request.ts";

const CHILD_DATABASE = "child_database";

const childrenSchema = z.object({
  results: z.array(z.object({ id: z.string(), type: z.string() })),
});

const databaseSchema = z.object({
  data_sources: z.array(z.object({ id: z.string() })),
});

export async function addTemplateDatabase(setup: DatabaseSetup, templateId: string): Promise<void> {
  try {
    const dataSourceId = await templateDataSourceId(setup.client, templateId);
    if (dataSourceId === undefined) return;
    await addDatabase(setup, { dataSourceId, projectMode: "own", blockPosition: "start" });
  } catch (error) {
    console.warn("Notion template setup failed:", String(error));
  }
}

async function templateDataSourceId(
  client: NotionClient,
  templateId: string,
): Promise<string | undefined> {
  const children = await requestNotionJson(
    client,
    { method: "GET", path: `/v1/blocks/${encodeURIComponent(templateId)}/children` },
    childrenSchema,
  );
  const block = children?.results.find((child) => child.type === CHILD_DATABASE);
  if (block === undefined) return undefined;
  const found = await requestNotionJson(
    client,
    { method: "GET", path: `/v1/databases/${encodeURIComponent(block.id)}` },
    databaseSchema,
  );
  return found?.data_sources[0]?.id;
}
