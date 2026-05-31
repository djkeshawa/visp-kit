import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanFiles } from "../../../src/scanner/scan-files.js";

describe("file scanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-files-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("indexes files with hashes and ignores safe default paths", async () => {
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await mkdir(path.join(tempDir, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "index.ts"), "export const x = 1;");
    await writeFile(path.join(tempDir, "src", "index.test.ts"), "test('x', () => x);");
    await writeFile(path.join(tempDir, "node_modules", "pkg", "index.js"), "");

    const files = await scanFiles(tempDir, "2026-01-01T00:00:00.000Z");

    expect(files.map((file) => file.path)).toEqual([
      "src/index.test.ts",
      "src/index.ts"
    ]);
    expect(files[0].hash).toHaveLength(64);
    expect(files[0].isTestFile).toBe(true);
    expect(files[1].language).toBe("TypeScript");
  });
});
