import {
  locales,
  notionBlockPositions,
  notionConnectionStatuses,
  notionProjectModes,
  notionProjectPropertyTypes,
  projectColors,
} from "@stt/shared";
import { isNull, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { TrackerPropertyIds } from "../notion/tracker-properties.ts";

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

export const notionOauthStates = sqliteTable("notion_oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

export const notionConnections = sqliteTable("notion_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  workspaceName: text("workspace_name").notNull(),
  workspaceIcon: text("workspace_icon"),
  botId: text("bot_id"),
  duplicatedTemplateId: text("duplicated_template_id"),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  status: text("status", { enum: notionConnectionStatuses }).notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const notionDatabases = sqliteTable(
  "notion_databases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => notionConnections.id, { onDelete: "cascade" }),
    databaseId: text("database_id").notNull(),
    dataSourceId: text("data_source_id").notNull(),
    title: text("title").notNull(),
    propertyIds: text("property_ids", { mode: "json" }).$type<TrackerPropertyIds>().notNull(),
    projectMode: text("project_mode", { enum: notionProjectModes }).notNull(),
    projectPropId: text("project_prop_id"),
    projectPropName: text("project_prop_name"),
    projectPropType: text("project_prop_type", { enum: notionProjectPropertyTypes }),
    blockPosition: text("block_position", { enum: notionBlockPositions }).notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("notion_databases_user_data_source_idx").on(table.userId, table.dataSourceId),
    uniqueIndex("notion_databases_user_default_idx")
      .on(table.userId)
      .where(sql`${table.isDefault} = 1`),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color", { enum: projectColors }).notNull(),
    notionDatabaseId: text("notion_database_id").references(() => notionDatabases.id),
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
