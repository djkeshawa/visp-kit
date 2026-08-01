import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  artifactSchemas,
  createArtifactReader,
  projectStatusArtifactPath,
  projectStatusSchema,
  type ProjectStatus
} from "../../../src/artifacts/public.js";

const status: ProjectStatus = {
  initialized: true,
  activeFeatureId: "001",
  activeFeatureSlug: "atomic-artifacts",
  activeFeaturePath: ".visp/features/001-atomic-artifacts",
  activeTaskId: "T001",
  currentState: "context_ready",
  lastCommand: "context",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:01:00.000Z"
};

describe("public artifact package surface", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-public-artifacts-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("publishes the reader from a side-effect-free package subpath", async () => {
    const manifest = JSON.parse(
      await readFile(path.resolve(import.meta.dirname, "../../../package.json"), "utf8")
    ) as {
      exports?: Record<string, string | { import?: string; types?: string }>;
    };

    expect(manifest.exports?.["./artifacts"]).toEqual({
      types: "./dist/artifacts.d.ts",
      import: "./dist/artifacts.js"
    });
    expect(manifest.exports?.["./*"]).toBe("./*");
  });

  it("exposes the public JSON schema registry and round-trips validated data", () => {
    expect(Object.keys(artifactSchemas).sort()).toEqual([
      "assuranceCase",
      "baselineEvidence",
      "candidateEvidence",
      "clarifications",
      "constitutionArtifact",
      "contextPack",
      "currentReviewDecision",
      "diffSnapshot",
      "feature",
      "featureIntent",
      "featureReview",
      "overrides",
      "plan",
      "policy",
      "pr",
      "projectConfig",
      "projectProfile",
      "projectStatus",
      "reconcile",
      "reviewDecision",
      "run",
      "runEvent",
      "runIndex",
      "specification",
      "taskGraph",
      "traceability",
      "verification",
      "workflowManifest"
    ]);

    const serialized = JSON.stringify(status);
    expect(artifactSchemas.projectStatus.parse(JSON.parse(serialized))).toEqual(status);
    expect(projectStatusSchema.parse(JSON.parse(serialized))).toEqual(status);
  });

  it("provides typed path-bound accessors without hiding the source path", async () => {
    const artifactPath = projectStatusArtifactPath(tempDir);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(status), "utf8");

    const reader = createArtifactReader(tempDir);
    const result = await reader.projectStatus();

    expect(result.state).toBe("present");
    if (result.state === "present") {
      expect(result.path).toBe(artifactPath);
      expect(result.value.activeTaskId).toBe("T001");
    }
  });

  it.each([
    ["feature", () => createArtifactReader(tempDir).feature("../escape")],
    ["task", () => createArtifactReader(tempDir).contextPack("001-feature", "../../task")],
    ["run", () => createArtifactReader(tempDir).run("../RUN001")]
  ])("rejects a traversing %s identifier before reading", (_label, read) => {
    expect(read).toThrow(/must be one safe path segment/u);
  });

  it("rejects a malformed review decision hash before reading", () => {
    const reader = createArtifactReader(tempDir);

    expect(() => reader.reviewDecision("001-feature", "T001", "../../decision")).toThrow(
      "Decision hash must be a prefixed lowercase SHA-256 digest."
    );
  });
});
