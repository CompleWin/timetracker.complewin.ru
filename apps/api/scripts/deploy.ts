import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import type { AppUrl } from "@stt/shared";
import { appUrlFromShell, requiredVariable, runScript, selectedEnvironment } from "./shell-env.ts";

type WranglerPackage = { bin: { wrangler: string } };

function wranglerBin(): string {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("wrangler/package.json");
  const { bin } = require(packagePath) as WranglerPackage;
  return join(dirname(packagePath), bin.wrangler);
}

function domainArgs({ host, customDomain }: AppUrl): string[] {
  return customDomain ? ["--domain", host] : [];
}

async function deploy(): Promise<void> {
  const { values } = parseArgs({
    options: { env: { type: "string" }, "dry-run": { type: "boolean" } },
  });
  const environment = selectedEnvironment(values.env);
  const appUrl = appUrlFromShell();
  const publisherName = requiredVariable("PUBLISHER_NAME");
  const supportEmail = requiredVariable("SUPPORT_EMAIL");
  const args = [
    wranglerBin(),
    "deploy",
    "--env",
    environment,
    "--var",
    `APP_URL:${appUrl.appUrl}`,
    "--var",
    `PUBLISHER_NAME:${publisherName}`,
    "--var",
    `SUPPORT_EMAIL:${supportEmail}`,
    ...domainArgs(appUrl),
    ...(values["dry-run"] === true ? ["--dry-run"] : []),
  ];
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

runScript(deploy);
