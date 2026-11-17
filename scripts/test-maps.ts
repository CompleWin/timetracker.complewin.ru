import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as prettier from "prettier";

type TestMap = {
  map: string;
  helpersDir: string;
  testsDir: string;
  example: string;
};

type Block = "files" | "example";

type Row = {
  file: string;
  description: string;
  functions: string[];
};

const TEST_MAPS: TestMap[] = [
  {
    map: "apps/api/test/harness/README.md",
    helpersDir: "apps/api/test/harness",
    testsDir: "apps/api/test",
    example: "session-delete.test.ts",
  },
  {
    map: "apps/web/e2e/README.md",
    helpersDir: "apps/web/e2e/helpers",
    testsDir: "apps/web/e2e",
    example: "session-dialog.spec.ts",
  },
];

const HEADER = ["| Файл | Описание | Функции |", "| --- | --- | --- |"];
const EXPORTED_FUNCTION = /^export (?:async )?function\*? ?(\w+)/gm;
const MODULE_FILE = /^(?!.*\.d\.ts$).*\.ts$/;
const SAMPLES_SECTION = /^## Образцы\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
const SAMPLE_FILE = /`([\w.-]+\.(?:test|spec)\.ts)`/g;

const root = path.resolve(import.meta.dirname, "..");
const shouldWrite = process.argv.includes("--write");
const problems: string[] = [];

for (const testMap of TEST_MAPS) {
  problems.push(...(await processMap(testMap)));
}

if (problems.length > 0) {
  console.error(`Test maps need attention:\n${problems.map((line) => `  ${line}`).join("\n")}`);
  process.exit(1);
}

async function processMap(testMap: TestMap): Promise<string[]> {
  const { map, helpersDir, testsDir } = testMap;
  const current = readText(map);
  const rows = buildRows(helpersDir, readDescriptions(blockContent(current, "files", map)));
  const withTable = replaceBlock(current, "files", renderTable(rows), map);
  const withExample = replaceBlock(withTable, "example", renderExample(testMap), map);
  const expected = await formatMarkdown(map, withExample);
  if (shouldWrite) {
    if (expected !== current) writeFileSync(path.join(root, map), expected);
    return [];
  }
  return [
    ...rows
      .filter((row) => row.description === "")
      .map((row) => `${map}: describe ${row.file} in the "Описание" column`),
    ...sampleProblems(current, testsDir).map((problem) => `${map}: ${problem}`),
    ...(expected === current
      ? []
      : [`${map}: generated blocks are out of date, run npm run format`]),
  ];
}

function markers(block: Block): [string, string] {
  return [`<!-- test-map:${block}:start -->`, `<!-- test-map:${block}:end -->`];
}

function blockBounds(text: string, block: Block, map: string): [number, number] {
  const [start, end] = markers(block);
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from === -1 || to < from) throw new Error(`${map}: no ${start} ... ${end} block`);
  return [from + start.length, to];
}

function blockContent(text: string, block: Block, map: string): string {
  const [from, to] = blockBounds(text, block, map);
  return text.slice(from, to);
}

function replaceBlock(text: string, block: Block, content: string, map: string): string {
  const [from, to] = blockBounds(text, block, map);
  return `${text.slice(0, from)}\n${content}\n${text.slice(to)}`;
}

function readDescriptions(table: string): Map<string, string> {
  const rows = table
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(HEADER.length)
    .map((line) => line.split(/(?<!\\)\|/).map((cell) => cell.trim()));
  return new Map(rows.map(([, file = "", description = ""]) => [unquote(file), description]));
}

function buildRows(helpersDir: string, descriptions: Map<string, string>): Row[] {
  return helperFiles(helpersDir).map((file) => ({
    file,
    description: descriptions.get(file) ?? "",
    functions: exportedFunctions(path.join(helpersDir, file)),
  }));
}

function renderTable(rows: Row[]): string {
  const lines = rows.map(
    ({ file, description, functions }) =>
      `| \`${file}\` | ${description} | ${functions.map((name) => `\`${name}\``).join(", ")} |`,
  );
  return [...HEADER, ...lines].join("\n");
}

function renderExample({ testsDir, example }: TestMap): string {
  const code = readText(path.join(testsDir, example)).trimEnd();
  return `\`${example}\`:\n\n\`\`\`ts\n${code}\n\`\`\``;
}

function sampleProblems(text: string, testsDir: string): string[] {
  const section = SAMPLES_SECTION.exec(text)?.[1] ?? "";
  const samples = matches(section, SAMPLE_FILE);
  if (samples.length === 0) return ['list a test file in the "Образцы" section'];
  return samples
    .filter((file) => !existsSync(path.join(root, testsDir, file)))
    .map((file) => `sample ${file} does not exist`);
}

function helperFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && MODULE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function exportedFunctions(file: string): string[] {
  return matches(readText(file), EXPORTED_FUNCTION);
}

async function formatMarkdown(file: string, text: string): Promise<string> {
  const filepath = path.join(root, file);
  const options = await prettier.resolveConfig(filepath);
  return prettier.format(text, { ...options, filepath });
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].flatMap(([, name]) => (name ? [name] : []));
}

function unquote(cell: string): string {
  return cell.replace(/^`|`$/g, "");
}

function readText(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}
