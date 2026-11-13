import { parseArgs } from "node:util";
import { botSetupCalls, type BotSetupCall } from "@stt/shared";
import { appUrlFromShell, requiredVariable, runScript, selectedEnvironment } from "./shell-env.ts";

const DEFAULT_API_BASE = "https://api.telegram.org";

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
  const { values } = parseArgs({ options: { env: { type: "string" } } });
  selectedEnvironment(values.env);
  const { appUrl } = appUrlFromShell();
  const token = requiredVariable("TG_BOT_TOKEN");
  const webhookSecret = requiredVariable("TG_WEBHOOK_SECRET");
  const baseUrl = `${process.env.TG_API_BASE ?? DEFAULT_API_BASE}/bot${token}`;
  for (const call of botSetupCalls(appUrl, webhookSecret)) await send(baseUrl, call);
}

runScript(setUpBot);
