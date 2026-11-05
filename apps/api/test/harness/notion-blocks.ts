import { expect } from "vitest";
import { external, type ExternalCall } from "./external.ts";
import { callsFromNowOn } from "./notion-databases.ts";
import type { FakeNotionPages, FakePage } from "./notion-pages.ts";
import {
  NOTION_V1,
  isRecord,
  notFound,
  readJson,
  resourceId,
  resourcePattern,
} from "./notion-workspace.ts";

export type FakeBlock = {
  id: string;
  parentId: string;
  type: string;
  content: Record<string, unknown>;
};

export type TimeBlock = {
  callout: FakeBlock;
  toggle: FakeBlock;
  lines: FakeBlock[];
};

export type BlockCalls = {
  all: ExternalCall[];
  appends(parentId: string): ExternalCall[];
  updates(block: FakeBlock): ExternalCall[];
  deletions(block: FakeBlock): ExternalCall[];
};

export type FakeNotionBlocks = {
  childrenOf(parentId: string): FakeBlock[];
  calloutsOn(page: FakePage): FakeBlock[];
  timeBlockOn(page: FakePage): TimeBlock;
  erase(block: FakeBlock): void;
  calls(): BlockCalls;
  callsDuring(action: () => Promise<unknown>): Promise<BlockCalls>;
};

const BLOCKS_URL = `${NOTION_V1}/blocks`;
const BLOCK_PATTERN = resourcePattern("blocks");
const CHILDREN_PATTERN = resourcePattern("blocks", "/children");
const ANY_BLOCK_PATTERN = resourcePattern("blocks", "(/children)?");
const MAX_CHILDREN_PER_APPEND = 100;
const STRUCTURAL_KEYS = new Set(["object", "type", "children"]);

export function fakeNotionBlocks(pages: FakeNotionPages): FakeNotionBlocks {
  const blocks = new Map<string, FakeBlock>();
  const childIds = new Map<string, string[]>();

  external.on("PATCH", CHILDREN_PATTERN, async (request) => {
    const parentId = resourceId(request);
    if (!isLiveParent(parentId)) return notFound();
    const body = await readJson(request);
    const specs = recordsIn(body.children);
    if (specs.length > MAX_CHILDREN_PER_APPEND) return tooManyChildren();
    const index = insertionIndex(parentId, body.position);
    if (index === undefined) return notFound();
    const created = specs.map((spec) => createBlock(parentId, spec));
    childrenIdsOf(parentId).splice(index, 0, ...created.map((block) => block.id));
    return Response.json(listJson(created.map(blockJson)));
  });

  external.on("GET", CHILDREN_PATTERN, (request) => {
    const parentId = resourceId(request);
    if (!isLiveParent(parentId)) return notFound();
    return Response.json(listJson(childrenOf(parentId).map(blockJson)));
  });

  external.on("GET", BLOCK_PATTERN, (request) => {
    const block = blocks.get(resourceId(request));
    return block ? Response.json(blockJson(block)) : notFound();
  });

  external.on("PATCH", BLOCK_PATTERN, async (request) => {
    const block = blocks.get(resourceId(request));
    if (!block) return notFound();
    const changes = (await readJson(request))[block.type];
    if (isRecord(changes)) block.content = { ...block.content, ...changes };
    return Response.json(blockJson(block));
  });

  external.on("DELETE", BLOCK_PATTERN, (request) => {
    const block = blocks.get(resourceId(request));
    if (!block) return notFound();
    erase(block);
    return Response.json({ ...blockJson(block), in_trash: true, archived: true });
  });

  function isLiveParent(id: string): boolean {
    return blocks.has(id) || pages.list().some((page) => page.id === id);
  }

  function childrenIdsOf(parentId: string): string[] {
    const existing = childIds.get(parentId);
    if (existing) return existing;
    const created: string[] = [];
    childIds.set(parentId, created);
    return created;
  }

  function childrenOf(parentId: string): FakeBlock[] {
    return childrenIdsOf(parentId).flatMap((id) => blocks.get(id) ?? []);
  }

  function insertionIndex(parentId: string, position: unknown): number | undefined {
    const siblings = childrenIdsOf(parentId);
    if (!isRecord(position) || position.type === "end") return siblings.length;
    if (position.type === "start") return 0;
    if (position.type !== "after_block") return siblings.length;
    const anchor = isRecord(position.after_block) ? position.after_block.id : undefined;
    const anchorIndex = typeof anchor === "string" ? siblings.indexOf(anchor) : -1;
    return anchorIndex === -1 ? undefined : anchorIndex + 1;
  }

  function createBlock(parentId: string, spec: Record<string, unknown>): FakeBlock {
    const type = blockTypeOf(spec);
    const typed = isRecord(spec[type]) ? spec[type] : {};
    const { children: nestedInType, ...content } = typed;
    const block: FakeBlock = { id: crypto.randomUUID(), parentId, type, content };
    blocks.set(block.id, block);
    const nested = [...recordsIn(nestedInType), ...recordsIn(spec.children)];
    childIds.set(
      block.id,
      nested.map((child) => createBlock(block.id, child).id),
    );
    return block;
  }

  function erase(block: FakeBlock): void {
    for (const child of childrenOf(block.id)) erase(child);
    blocks.delete(block.id);
    childIds.delete(block.id);
    const siblings = childrenIdsOf(block.parentId);
    const index = siblings.indexOf(block.id);
    if (index !== -1) siblings.splice(index, 1);
  }

  function blockJson(block: FakeBlock): Record<string, unknown> {
    return {
      object: "block",
      id: block.id,
      parent: blocks.has(block.parentId)
        ? { type: "block_id", block_id: block.parentId }
        : { type: "page_id", page_id: block.parentId },
      type: block.type,
      [block.type]: block.content,
      has_children: childrenIdsOf(block.id).length > 0,
      in_trash: false,
      archived: false,
    };
  }

  function calloutsOn(page: FakePage): FakeBlock[] {
    return childrenOf(page.id).filter((block) => block.type === "callout");
  }

  function timeBlockOn(page: FakePage): TimeBlock {
    const callouts = calloutsOn(page);
    expect(callouts).toHaveLength(1);
    const [callout] = callouts;
    const toggle = callout && childrenOf(callout.id).find((block) => block.type === "toggle");
    if (!callout || !toggle) throw new Error(`Page ${page.id} has no callout with a toggle`);
    return { callout, toggle, lines: childrenOf(toggle.id) };
  }

  function calls(): BlockCalls {
    return blockCallsOf(external.calls({ url: ANY_BLOCK_PATTERN }));
  }

  async function callsDuring(action: () => Promise<unknown>): Promise<BlockCalls> {
    const newCalls = callsFromNowOn(() => calls().all);
    await action();
    return blockCallsOf(newCalls());
  }

  return {
    childrenOf,
    calloutsOn,
    timeBlockOn,
    erase,
    calls,
    callsDuring,
  };
}

export function richTextContents(block: FakeBlock): string[] {
  return recordsIn(block.content.rich_text).map((item) =>
    isRecord(item.text) && typeof item.text.content === "string" ? item.text.content : "",
  );
}

export function textOf(block: FakeBlock): string {
  return richTextContents(block).join("");
}

export function lineTexts(timeBlock: TimeBlock): string[] {
  return timeBlock.lines.map(textOf);
}

function blockCallsOf(all: ExternalCall[]): BlockCalls {
  const to = (method: string, url: string): ExternalCall[] =>
    all.filter((call) => call.method === method && pathOf(call.url) === url);
  return {
    all,
    appends: (parentId) => to("PATCH", `${BLOCKS_URL}/${parentId}/children`),
    updates: (block) => to("PATCH", `${BLOCKS_URL}/${block.id}`),
    deletions: (block) => to("DELETE", `${BLOCKS_URL}/${block.id}`),
  };
}

function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

function blockTypeOf(spec: Record<string, unknown>): string {
  if (typeof spec.type === "string") return spec.type;
  return Object.keys(spec).find((key) => !STRUCTURAL_KEYS.has(key)) ?? "";
}

function recordsIn(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function listJson(results: unknown[]): Record<string, unknown> {
  return { object: "list", results, next_cursor: null, has_more: false, type: "block", block: {} };
}

function tooManyChildren(): Response {
  return Response.json(
    {
      object: "error",
      status: 400,
      code: "validation_error",
      message: `body.children.length should be at most ${MAX_CHILDREN_PER_APPEND}`,
    },
    { status: 400 },
  );
}
