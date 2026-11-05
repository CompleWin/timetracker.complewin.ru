import { parseArgs } from "node:util";
import { botSetupCalls, type BotSetupCall } from "@stt/shared";
import { unstable_readConfig } from "wrangler";

const ENVIRONMENTS = ["staging", "production"];
const DEFAULT_API_BASE = "https://api.telegram.org";

function selectedEnvironment(): string {
  const { values } = parseArgs({ options: { env: { type: "string" } } });
  if (values.env === undefined || !ENVIRONMENTS.includes(values.env)) {
    throw new Error(`Pass --env ${ENVIRONMENTS.join("|")}`);
  }
  return values.env;
}

function appUrlOf(environment: string): string {
  const appUrl = unstable_readConfig({ env: environment }).vars.APP_URL;
  if (typeof appUrl !== "string") throw new Error(`APP_URL is not set for ${environment}`);
  return appUrl;
}

function requiredVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Set ${name} in the shell environment`);
  return value;
}

async function send(baseUrl: string, { method, body }: BotSetupCall): Promise<void> {
  const response = await fetch(`${baseUrl}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} failed: ${response.status} ${await response.text()}`);
  }
  console.log(`${method}: ok`);
}

async function setUpBot(): Promise<void> {
  const environment = selectedEnvironment();
  const appUrl = appUrlOf(environment);
  const token = requiredVariable("TG_BOT_TOKEN");
  const webhookSecret = requiredVariable("TG_WEBHOOK_SECRET");
  const baseUrl = `${process.env.TG_API_BASE ?? DEFAULT_API_BASE}/bot${token}`;
  for (const call of botSetupCalls(appUrl, webhookSecret)) await send(baseUrl, call);
}

setUpBot().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
