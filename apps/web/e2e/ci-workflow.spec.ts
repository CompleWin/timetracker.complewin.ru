import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const workflowsDir = new URL("../../../.github/workflows/", import.meta.url);

function npmCommand(command: string): RegExp {
  return new RegExp(`\\bnpm ${command}(?![\\w:-])`);
}

const requiredCommands: Record<string, RegExp> = {
  "npm ci": npmCommand("ci"),
  "npm run typecheck": npmCommand("run typecheck"),
  "npm run lint": npmCommand("run lint"),
  "npm test": npmCommand("(?:run )?test"),
  "npm run test:e2e": npmCommand("run test:e2e"),
};

function readWorkflows(): string[] {
  return readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => readFileSync(new URL(name, workflowsDir), "utf8"));
}

function runsOnPullRequest(workflow: string): boolean {
  return /\bpull_request\b/.test(workflow);
}

function missingCommands(workflow: string): string[] {
  return Object.entries(requiredCommands)
    .filter(([, pattern]) => !pattern.test(workflow))
    .map(([name]) => name);
}

test("12. workflow CI на каждый PR запускает npm ci, typecheck, lint, test и test:e2e", () => {
  const pullRequestWorkflows = readWorkflows().filter(runsOnPullRequest);

  expect(pullRequestWorkflows.map(missingCommands)).toContainEqual([]);
});
