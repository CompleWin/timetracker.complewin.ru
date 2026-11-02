import { locales, projectColors } from "@stt/shared";
import { isNull } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  telegramId: integer("telegram_id").notNull().unique(),
  name: text("name").notNull(),
  username: text("username"),
  photoUrl: text("photo_url"),
  botCanMessage: integer("bot_can_message", { mode: "boolean" }).notNull().default(false),
  timezone: text("timezone"),
  locale: text("locale", { enum: locales }).notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    userAgent: text("user_agent"),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  returnTo: text("return_to").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color", { enum: projectColors }).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("projects_user_id_idx").on(table.userId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id),
    title: text("title").notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("tasks_user_id_idx").on(table.userId),
    index("tasks_project_id_idx").on(table.projectId),
  ],
);

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    note: text("note").notNull().default(""),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("time_entries_user_id_idx").on(table.userId),
    index("time_entries_task_started_idx").on(table.taskId, table.startedAt),
    uniqueIndex("time_entries_running_task_idx").on(table.taskId).where(isNull(table.endedAt)),
  ],
);
