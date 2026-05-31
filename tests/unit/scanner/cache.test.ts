import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeJsonFile } from "../../../src/core/file-system.js";
import { readPreviousSummaries } from "../../../src/scanner/cache.js";

describe("summary cache", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-cache-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads previous summaries by path", async () => {
    const cachePath = path.join(tempDir, ".visp", "cache", "file-summaries.json");
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeJsonFile(cachePath, {
      generatedAt: "2026-01-01T00:00:00.000Z",
      items: [
        {
          path: "src/index.ts",
          hash: "abc",
          language: "TypeScript",
          sizeBytes: 1,
          lineCount: 1,
          imports: [],
          exports: [],
          symbols: [],
          comments: [],
          summaryKind: "deterministic"
        }
      ]
    });

    const cache = await readPreviousSummaries(cachePath);

    expect(cache.get("src/index.ts")?.hash).toBe("abc");
  });

  it("returns an empty cache when no valid cache exists", async () => {
    expect(await readPreviousSummaries(path.join(tempDir, "missing.json"))).toEqual(
      new Map()
    );
  });
});
