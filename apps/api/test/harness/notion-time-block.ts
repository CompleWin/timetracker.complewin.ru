import { api, type TestResponse, type TestSession } from "./api.ts";
import { atClock } from "./clock.ts";
import { addSession, interval, type ManualSessionInput } from "./manual-sessions.ts";
import { fakeNotionBlocks, type FakeNotionBlocks } from "./notion-blocks.ts";
import type { BlockPosition, Locale } from "./notion-databases.ts";
import {
  SETUP_TIME,
  TASKS_DATABASE,
  cronAt,
  fakeNotionSync,
  loginForSync,
  type DatabaseSetup,
  type FakeNotionSync,
} from "./notion-sync.ts";
import { connectWithLinkedTask, type UserWithTaskPage } from "./notion-task-pages.ts";
import { requireStatus, type SessionOpts } from "./rest.ts";
import { taskPath } from "./tasks.ts";
import type { TestTimerSession } from "./timers.ts";

export type FakeNotionTimeBlocks = {
  sync: FakeNotionSync;
  blocks: FakeNotionBlocks;
};

export type UserWithSessionLog = UserWithTaskPage & {
  sessions: TestTimerSession[];
};

export const MOSCOW = "Europe/Moscow";
export const BLOCK_AT_START: DatabaseSetup = { ...TASKS_DATABASE, blockPosition: "start" };

export const AFTER_SESSIONS = atClock("03:00");
export const NEXT_RUN = atClock("04:00");
export const FIRST_SESSION = interval("01:00", "01:30");
export const FIRST_LINE = "01.01 04:00–04:30 · 30 мин";
export const SECOND_SESSION = interval("02:00", "02:45");
export const SECOND_LINE = "01.01 05:00–05:45 · 45 мин";

export function fakeNotionTimeBlocks(): FakeNotionTimeBlocks {
  const sync = fakeNotionSync();
  return { sync, blocks: fakeNotionBlocks(sync.pages) };
}

export async function setTimezone(session: TestSession, timezone: string): Promise<void> {
  const response = await api.patch("/api/me", { timezone }, { ...SETUP_TIME, as: session });
  requireStatus(response, 200, "PATCH /api/me");
}

export async function moscowUserWithLinkedTask(
  fake: FakeNotionSync,
  locale: Locale = "ru",
  database: DatabaseSetup = BLOCK_AT_START,
): Promise<UserWithTaskPage> {
  const session = await loginForSync(locale);
  await setTimezone(session, MOSCOW);
  return connectWithLinkedTask(fake, session, database);
}

export async function addSessions(
  user: UserWithTaskPage,
  inputs: ManualSessionInput[],
  time: { now: string } = AFTER_SESSIONS,
): Promise<TestTimerSession[]> {
  const added: TestTimerSession[] = [];
  for (const input of inputs) {
    added.push(await addSession(user.session, user.task.id, input, time));
  }
  return added;
}

export async function userWithSessionLog(
  fake: FakeNotionSync,
  inputs: ManualSessionInput[],
): Promise<UserWithSessionLog> {
  const user = await moscowUserWithLinkedTask(fake);
  const sessions = await addSessions(user, inputs);
  await cronAt(AFTER_SESSIONS);
  return { ...user, sessions };
}

export function requestBlockPosition(
  session: TestSession,
  taskId: string,
  notionBlockPosition: BlockPosition | null,
  opts: SessionOpts = {},
): Promise<TestResponse> {
  return api.patch(taskPath(taskId), { notionBlockPosition }, { ...opts, as: session });
}

export async function setBlockPosition(
  session: TestSession,
  taskId: string,
  notionBlockPosition: BlockPosition | null,
  opts: SessionOpts = {},
): Promise<void> {
  const response = await requestBlockPosition(session, taskId, notionBlockPosition, opts);
  requireStatus(response, 200, `PATCH ${taskPath(taskId)}`);
}
