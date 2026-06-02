import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractFileSnippet } from "../../../src/context/file-snippets.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

describe("file snippets", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-snippet-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("extracts bounded first-line snippets", async () => {
    await writeFile(
      path.join(tempDir, "notes.ts"),
      Array.from({ length: 20 }, (_, index) => `export const v${index} = ${index};`).join("\n"),
      "utf8"
    );

    const snippet = expectOk(
      await extractFileSnippet({
        rootPath: tempDir,
        filePath: "notes.ts",
        maxTokens: 20,
        reason: "test"
      })
    );

    expect(snippet?.startLine).toBe(1);
    expect(snippet?.endLine).toBeLessThan(20);
    expect(snippet?.tokenEstimate).toBeLessThanOrEqual(25);
  });

  it("skips ignored binary paths", async () => {
    const snippet = expectOk(
      await extractFileSnippet({
        rootPath: tempDir,
        filePath: "image.png",
        maxTokens: 20,
        reason: "test"
      })
    );

    expect(snippet).toBeUndefined();
  });
});
