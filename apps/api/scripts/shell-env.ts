import { parseAppUrl, type AppUrl } from "@stt/shared";

const ENVIRONMENTS = ["staging", "production"];

export function selectedEnvironment(value: string | undefined): string {
  if (value === undefined || !ENVIRONMENTS.includes(value)) {
    throw new Error(`Pass --env ${ENVIRONMENTS.join("|")}`);
  }
  return value;
}

export function requiredVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Set ${name} in the shell environment`);
  return value;
}

export function appUrlFromShell(): AppUrl {
  return parseAppUrl("APP_URL", process.env.APP_URL);
}

export function runScript(script: () => Promise<void>): void {
  script().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
