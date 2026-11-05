import { z } from "zod";
import type { NotionClient } from "../notion/client.ts";
import type { PlacedPosition } from "./block-links.ts";
import {
  ensureAccepted,
  isBadRequest,
  isNotFound,
  PageRejected,
  sendRequest,
  ServerFailure,
  type PageReply,
} from "./page-requests.ts";

export type BlockSpec = Record<string, unknown>;

export type InsertPosition =
  { type: PlacedPosition } | { type: "after_block"; after_block: { id: string } };

export class BlockGone extends PageRejected {
  constructor(readonly blockId: string) {
    super(`Notion block ${blockId} was not found`);
  }
}

const blockListSchema = z.object({
  results: z.array(z.object({ id: z.string(), type: z.string() })),
});

const blockSchema = z.object({ in_trash: z.boolean().optional() });

export async function appendBlocks(
  client: NotionClient,
  parentId: string,
  children: BlockSpec[],
  position?: InsertPosition,
  silent = false,
): Promise<string[]> {
  const body = {
    children,
    ...(position && { position }),
    ...(silent && { notifications: { mode: "silent" } }),
  };
  const reply = await sendRequest(client, {
    method: "PATCH",
    path: childrenPath(parentId),
    body,
  });
  if (isNotFound(reply)) throw new BlockGone(parentId);
  return blockList(reply).map(({ id }) => id);
}

export async function childBlockOfType(
  client: NotionClient,
  parentId: string,
  type: string,
): Promise<string> {
  const reply = await sendRequest(client, { method: "GET", path: childrenPath(parentId) });
  if (isNotFound(reply)) throw new BlockGone(parentId);
  const child = blockList(reply).find((block) => block.type === type);
  if (child === undefined) throw new BlockGone(parentId);
  return child.id;
}

export async function updateBlock(
  client: NotionClient,
  blockId: string,
  type: string,
  content: Record<string, unknown>,
): Promise<void> {
  const reply = await sendRequest(client, {
    method: "PATCH",
    path: blockPath(blockId),
    body: { [type]: content },
  });
  if (isNotFound(reply) || isTrashed(reply.body)) throw new BlockGone(blockId);
  if (isBadRequest(reply) && (await isBlockGone(client, blockId))) throw new BlockGone(blockId);
  ensureAccepted(reply);
}

export async function deleteBlock(client: NotionClient, blockId: string): Promise<void> {
  const reply = await sendRequest(client, { method: "DELETE", path: blockPath(blockId) });
  if (!isNotFound(reply)) ensureAccepted(reply);
}

async function isBlockGone(client: NotionClient, blockId: string): Promise<boolean> {
  const reply = await sendRequest(client, { method: "GET", path: blockPath(blockId) });
  return isNotFound(reply) || isTrashed(reply.body);
}

function isTrashed(body: unknown): boolean {
  const parsed = blockSchema.safeParse(body);
  return parsed.success && parsed.data.in_trash === true;
}

function blockList(reply: PageReply) {
  ensureAccepted(reply);
  const list = blockListSchema.safeParse(reply.body);
  if (!list.success) throw new ServerFailure("Notion returned an unexpected block list");
  return list.data.results;
}

function blockPath(blockId: string): string {
  return `/v1/blocks/${encodeURIComponent(blockId)}`;
}

function childrenPath(blockId: string): string {
  return `${blockPath(blockId)}/children`;
}
