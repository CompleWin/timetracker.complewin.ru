import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { testEnv } from "./test/harness/test-env.ts";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));
const webDistFixtureDir = fileURLToPath(new URL("./test/harness/web-dist", import.meta.url));

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        assets: { directory: webDistFixtureDir },
        bindings: {
          ...testEnv,
          TEST_MIGRATIONS: await readD1Migrations(migrationsDir),
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/harness/setup.ts"],
  },
}));
