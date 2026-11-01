import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/.wrangler/",
    "**/test-results/",
    "**/playwright-report/",
    "**/blob-report/",
  ]),
  js.configs.recommended,
  tseslint.configs.strict,
  vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: globals.browser,
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/api/test/harness/api.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  prettier,
);
