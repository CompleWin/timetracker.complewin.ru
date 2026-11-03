import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const backupsDir = "../../backups";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = `${backupsDir}/stt-production-${timestamp}.sql`;

mkdirSync(backupsDir, { recursive: true });
const result = spawnSync(`wrangler d1 export DB --remote --env production --output ${output}`, {
  stdio: "inherit",
  shell: true,
});
process.exitCode = result.status ?? 1;
