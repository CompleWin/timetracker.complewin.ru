import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const repoRoot = new URL("../../../", import.meta.url);

function readRepoFile(name: string): string {
  return readFileSync(new URL(name, repoRoot), "utf8");
}

function licenseLines(): string[] {
  return readRepoFile("LICENSE")
    .split(/\r?\n/)
    .map((line) => line.trim());
}

test("10. LICENSE в корне репозитория содержит текст MIT License с копирайтом complewin", () => {
  const lines = licenseLines();
  const text = lines.join(" ");

  expect(lines[0]).toBe("MIT License");
  expect(lines).toContain("Copyright (c) 2026 complewin");
  expect(text).toContain(
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
  );
  expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
});

test('10. корневой package.json объявляет "license": "MIT"', () => {
  const packageJson: unknown = JSON.parse(readRepoFile("package.json"));

  expect(packageJson).toMatchObject({ license: "MIT" });
});
