import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readArtifact } from "../../../src/artifacts/artifact-reader.js";
import { projectProfileSchema } from "../../../src/artifacts/schemas/project.schema.js";
import { isErr, isOk } from "../../../src/core/result.js";
import { validProjectProfile } from "./fixtures.js";

describe("artifact reader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-artifact-reader-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads and validates artifact JSON before returning data", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, JSON.stringify(validProjectProfile), "utf8");

    const result = await readArtifact(
      artifactPath,
      projectProfileSchema,
      { artifactName: "project profile" }
    );

    expect(result).toEqual({ ok: true, value: validProjectProfile });
  });

  it("returns a clear validation error for invalid JSON", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, "{", "utf8");

    const result = await readArtifact(artifactPath, projectProfileSchema);

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.message).toContain("Invalid JSON");
    }
  });

  it("returns field-level validation errors for invalid artifacts", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    const invalid = { ...validProjectProfile, packageManager: "pnpmx" };
    await writeFile(artifactPath, JSON.stringify(invalid), "utf8");

    const result = await readArtifact(
      artifactPath,
      projectProfileSchema,
      { artifactName: "project profile" }
    );

    expect(isOk(result)).toBe(false);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.message).toContain("Invalid project profile");
      expect(result.error.message).toContain("packageManager");
    }
  });
});
