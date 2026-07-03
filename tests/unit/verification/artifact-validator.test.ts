import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  featureIntentArtifactPath,
  taskGraphArtifactPath
} from "../../../src/artifacts/artifact-paths.js";
import { writeArtifact } from "../../../src/artifacts/artifact-writer.js";
import { featureIntentSchema } from "../../../src/artifacts/schemas/feature.schema.js";
import { taskGraphArtifactSchema } from "../../../src/artifacts/schemas/task.schema.js";
import { validateArtifacts } from "../../../src/verification/artifact-validator.js";
import { timestamp, validFeature, validTaskGraph } from "../artifacts/fixtures.js";

async function writeRequiredArtifacts(rootPath: string): Promise<void> {
  await writeArtifact(
    featureIntentArtifactPath(rootPath, "001-note-pinning"),
    featureIntentSchema,
    {
      ...validFeature,
      slug: "note-pinning",
      rawUserRequest: "Add note pinning",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    { artifactName: "feature intent" }
  );
  await writeArtifact(
    taskGraphArtifactPath(rootPath, "001-note-pinning"),
    taskGraphArtifactSchema,
    validTaskGraph,
    { artifactName: "task graph" }
  );
}

describe("artifact validator", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-artifact-validator-"));
    await mkdir(path.join(tempDir, ".visp", "features", "001-note-pinning"), {
      recursive: true
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("passes required valid artifacts and warns on optional missing artifacts", async () => {
    await writeRequiredArtifacts(tempDir);

    const result = await validateArtifacts({
      targetPath: tempDir,
      featureKey: "001-note-pinning"
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("Optional artifact missing");
    expect(
      result.checked.find((artifact) => artifact.path.endsWith("task-graph.json"))?.passed
    ).toBe(true);
  });

  it("fails invalid JSON artifacts", async () => {
    await writeRequiredArtifacts(tempDir);
    await writeFile(taskGraphArtifactPath(tempDir, "001-note-pinning"), "{not-json", "utf8");

    const result = await validateArtifacts({
      targetPath: tempDir,
      featureKey: "001-note-pinning"
    });

    expect(result.status).toBe("failed");
    expect(result.errors.join(" ")).toContain("task-graph.json");
  });
});
