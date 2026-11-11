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
  TG_BOT_TOKEN: string;
  TG_BOT_USERNAME: string;
  TG_WEBHOOK_SECRET: string;
  TG_API_BASE?: string;
  NOTION_CLIENT_ID: string;
  NOTION_CLIENT_SECRET: string;
  NOTION_API_BASE?: string;
  TOKEN_ENC_KEY: string;
  PUBLISHER_NAME: string;
  SUPPORT_EMAIL: string;
  API_RATE_LIMITER?: RateLimit;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    now: Date;
    sessionUser?: User;
  };
};

export type AuthedEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & {
    user: User;
  };
};
