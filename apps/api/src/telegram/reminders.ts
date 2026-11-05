import { elapsedSec, formatClock, t, type Locale } from "@stt/shared";
import { and, asc, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import { database, type Database } from "../db/client.ts";
import { tasks, timeEntries, users } from "../db/schema.ts";
import type { Bindings } from "../env.ts";
import { liveEntries, ownEntry } from "../timers/time-entries.ts";
import { userBotApi } from "./bot-api.ts";
import { reminderButtons } from "./keyboards.ts";

const MAX_REMINDERS_PER_USER = 5;
const MS_PER_MINUTE = 60_000;

type DueReminder = {
  sessionId: string;
  startedAt: Date;
  title: string;
  userId: string;
  telegramId: number;
  locale: Locale;
};

export async function sendReminders(env: Bindings, now: Date): Promise<void> {
  const db = database(env);
  for (const reminders of perUser(await dueReminders(db, now))) {
    await remindUser(env, db, reminders, now);
  }
}

export async function snoozeReminder(
  db: Database,
  userId: string,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(timeEntries)
    .set({ remindedAt: now })
    .where(and(ownEntry(userId, sessionId), isNull(timeEntries.endedAt)))
    .returning({ id: timeEntries.id });
  return rows.length > 0;
}

function dueReminders(db: Database, now: Date): Promise<DueReminder[]> {
  return db
    .select({
      sessionId: timeEntries.id,
      startedAt: timeEntries.startedAt,
      title: tasks.title,
      userId: users.id,
      telegramId: users.telegramId,
      locale: users.locale,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(
      and(
        liveEntries,
        isNull(timeEntries.endedAt),
        eq(users.botCanMessage, true),
        gt(users.reminderThresholdMin, 0),
        thresholdPassedSince(timeEntries.startedAt, now),
        or(isNull(timeEntries.remindedAt), thresholdPassedSince(timeEntries.remindedAt, now)),
      ),
    )
    .orderBy(asc(users.id), asc(timeEntries.startedAt), asc(timeEntries.id));
}

function thresholdPassedSince(
  time: typeof timeEntries.startedAt | typeof timeEntries.remindedAt,
  now: Date,
): SQL {
  return sql`${time} + ${users.reminderThresholdMin} * ${MS_PER_MINUTE} <= ${now.getTime()}`;
}

function perUser(reminders: DueReminder[]): DueReminder[][] {
  const groups = new Map<string, DueReminder[]>();
  for (const reminder of reminders) {
    const group = groups.get(reminder.userId) ?? [];
    if (group.length < MAX_REMINDERS_PER_USER) group.push(reminder);
    groups.set(reminder.userId, group);
  }
  return [...groups.values()];
}

async function remindUser(
  env: Bindings,
  db: Database,
  reminders: DueReminder[],
  now: Date,
): Promise<void> {
  const [first] = reminders;
  if (first === undefined) return;
  const bot = userBotApi(env, db, first.userId);
  for (const reminder of reminders) {
    const outcome = await bot("sendMessage", reminderMessage(reminder, now));
    if (outcome === "blocked") return;
    if (outcome === "sent") await markReminded(db, reminder.sessionId, now);
  }
}

function reminderMessage(reminder: DueReminder, now: Date): object {
  const clock = formatClock(elapsedSec(reminder.startedAt.toISOString(), now.getTime()));
  return {
    chat_id: reminder.telegramId,
    text: t(reminder.locale, "bot.reminder", { title: reminder.title, clock }),
    reply_markup: reminderButtons(reminder.locale, reminder.sessionId),
  };
}

async function markReminded(db: Database, sessionId: string, now: Date): Promise<void> {
  await db.update(timeEntries).set({ remindedAt: now }).where(eq(timeEntries.id, sessionId));
}
