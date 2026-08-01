import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createArtifactReader } from "../../../src/artifacts/public.js";

describe("Memory artifact accessors", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-memory-accessors-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads canonical Memory Markdown paths with source provenance", async () => {
    const memoryDir = path.join(tempDir, ".visp", "memory");
    const artifacts = [
      ["projectSummary", "project-summary.md", "# Project summary\n"],
      ["patterns", "patterns.md", "# Patterns\n"],
      ["constitution", "constitution.md", "# Constitution\n"]
    ] as const;
    await mkdir(memoryDir, { recursive: true });

    for (const [, fileName, contents] of artifacts) {
      await writeFile(path.join(memoryDir, fileName), contents, "utf8");
    }

    const reader = createArtifactReader(tempDir);

    for (const [accessor, fileName, contents] of artifacts) {
      const result = await reader[accessor]();

      expect(result.state).toBe("present");
      if (result.state === "present") {
        expect(result.path).toBe(path.join(tempDir, ".visp", "memory", fileName));
        expect(result.value).toBe(contents);
        expect(result.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
      }
    }
  });

  it("preserves a degraded Memory result and its canonical expected path", async () => {
    const expectedPath = path.join(tempDir, ".visp", "memory", "patterns.md");

    expect(await createArtifactReader(tempDir).patterns()).toEqual({
      state: "missing",
      path: expectedPath,
      reason: `Artifact is missing at ${expectedPath}.`
    });
  });

  it("does not present whitespace-only Memory Markdown as content", async () => {
    const artifactPath = path.join(tempDir, ".visp", "memory", "project-summary.md");
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, " \n\t", "utf8");

    const result = await createArtifactReader(tempDir).projectSummary();

    expect(result.state).toBe("unreadable");
    if (result.state === "unreadable") {
      expect(result.path).toBe(artifactPath);
      expect(result.issue).toBe("invalid_schema");
    }
  });
});
