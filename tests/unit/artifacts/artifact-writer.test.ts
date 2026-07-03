import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeArtifact } from "../../../src/artifacts/artifact-writer.js";
import { projectProfileSchema } from "../../../src/artifacts/schemas/project.schema.js";
import { pathExists } from "../../../src/core/file-system.js";
import { isErr, isOk } from "../../../src/core/result.js";
import { validProjectProfile } from "./fixtures.js";

describe("artifact writer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-artifact-writer-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("validates data and writes formatted JSON", async () => {
    const artifactPath = path.join(tempDir, ".visp", "project.json");

    const result = await writeArtifact(artifactPath, projectProfileSchema, validProjectProfile, {
      artifactName: "project profile"
    });
    const raw = await readFile(artifactPath, "utf8");

    expect(result).toEqual({ ok: true, value: artifactPath });
    expect(raw).toContain('\n  "name": "visp-kit",\n');
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("does not write invalid artifacts", async () => {
    const artifactPath = path.join(tempDir, ".visp", "project.json");
    const invalid = { ...validProjectProfile, rootPath: "" };

    const result = await writeArtifact(artifactPath, projectProfileSchema, invalid, {
      artifactName: "project profile"
    });

    expect(isOk(result)).toBe(false);
    expect(await pathExists(artifactPath)).toEqual({ ok: true, value: false });

    if (isErr(result)) {
      expect(result.error.message).toContain("rootPath");
    }
  });
});
