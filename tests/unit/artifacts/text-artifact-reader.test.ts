import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { readTextArtifactState } from "../../../src/artifacts/public.js";

const nonBlankTextSchema = z.string().refine((value) => value.trim().length > 0);

describe("text artifact reader states", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-text-artifact-reader-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns present text with source provenance", async () => {
    const artifactPath = path.join(tempDir, "artifact.md");
    await writeFile(artifactPath, "# Project context\n", "utf8");

    const result = await readTextArtifactState(artifactPath, nonBlankTextSchema);

    expect(result.state).toBe("present");
    if (result.state === "present") {
      expect(result.path).toBe(artifactPath);
      expect(result.value).toBe("# Project context\n");
      expect(result.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    }
  });

  it("returns missing for an absent text artifact", async () => {
    const artifactPath = path.join(tempDir, "missing.md");

    expect(await readTextArtifactState(artifactPath, nonBlankTextSchema)).toEqual({
      state: "missing",
      path: artifactPath,
      reason: `Artifact is missing at ${artifactPath}.`
    });
  });

  it("returns stale text against an explicit freshness boundary", async () => {
    const artifactPath = path.join(tempDir, "artifact.md");
    await writeFile(artifactPath, "Current project context", "utf8");
    await utimes(
      artifactPath,
      new Date("2026-08-01T08:00:00.000Z"),
      new Date("2026-08-01T08:00:00.000Z")
    );

    const result = await readTextArtifactState(artifactPath, nonBlankTextSchema, {
      staleAfter: new Date("2026-08-01T09:00:00.000Z")
    });

    expect(result.state).toBe("stale");
    if (result.state === "stale") {
      expect(result.path).toBe(artifactPath);
      expect(result.value).toBe("Current project context");
      expect(result.modifiedAt).toBe("2026-08-01T08:00:00.000Z");
      expect(result.staleAfter).toBe("2026-08-01T09:00:00.000Z");
    }
  });

  it("returns unreadable for an I/O failure", async () => {
    const artifactPath = path.join(tempDir, "directory.md");
    await mkdir(artifactPath);

    const result = await readTextArtifactState(artifactPath, nonBlankTextSchema);

    expect(result.state).toBe("unreadable");
    if (result.state === "unreadable") {
      expect(result.path).toBe(artifactPath);
      expect(result.issue).toBe("io");
      expect(result.reason).toContain(`Unable to read ${artifactPath}`);
    }
  });

  it.each([
    ["zero-byte", ""],
    ["whitespace-only", " \n\t"]
  ])("returns unreadable for %s text", async (_label, contents) => {
    const artifactPath = path.join(tempDir, "artifact.md");
    await writeFile(artifactPath, contents, "utf8");

    const result = await readTextArtifactState(artifactPath, nonBlankTextSchema);

    expect(result.state).toBe("unreadable");
    if (result.state === "unreadable") {
      expect(result.path).toBe(artifactPath);
      expect(result.issue).toBe("invalid_schema");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("returns unreadable for malformed UTF-8 text", async () => {
    const artifactPath = path.join(tempDir, "artifact.md");
    await writeFile(artifactPath, Buffer.from([0x23, 0x20, 0x80, 0x0a]));

    const result = await readTextArtifactState(artifactPath, nonBlankTextSchema);

    expect(result.state).toBe("unreadable");
    if (result.state === "unreadable") {
      expect(result.path).toBe(artifactPath);
      expect(result.issue).toBe("invalid_schema");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
