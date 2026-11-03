import type { User } from "@stt/shared";

export type Environment = "dev" | "test" | "staging" | "production";

export type Bindings = {
  ENV: Environment;
  APP_URL: string;
  DB: D1Database;
  ASSETS: Fetcher;
  TG_CLIENT_ID: string;
  TG_CLIENT_SECRET: string;
  TG_OAUTH_BASE?: string;
  NOTION_CLIENT_ID: string;
  NOTION_CLIENT_SECRET: string;
  NOTION_API_BASE?: string;
  TOKEN_ENC_KEY: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    now: Date;
  };
};

export type AuthedEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & {
    user: User;
  };
};
