export type Environment = "dev" | "test" | "staging" | "production";

export type Bindings = {
  ENV: Environment;
  APP_URL: string;
  DB: D1Database;
  ASSETS: Fetcher;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    now: Date;
  };
};
