import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readSpecArtifactWithNormalization,
  validateSpecArtifactWithNormalization
} from "../../../../src/workflows/shared/spec-artifact.js";

const criterion = {
  id: "AC001",
  requirementId: "REQ001",
  description: "Pinned notes appear first.",
  testable: true,
  validationMethod: "unit"
};

function specWith(input: {
  readonly topLevel: readonly unknown[];
  readonly nested: readonly unknown[];
}): unknown {
  return {
    featureId: "001",
    featureSlug: "note-pinning",
    title: "Add note pinning",
    status: "ready",
    userStories: [],
    requirements: [
      {
        id: "REQ001",
        featureId: "001",
        title: "Pin notes",
        description: "A note can be pinned.",
        source: "user",
        priority: "must",
        acceptanceCriteria: [...input.nested],
        assumptions: [],
        outOfScope: []
      }
    ],
    acceptanceCriteria: [...input.topLevel],
    businessRules: [],
    nonFunctionalRequirements: {
      performance: [],
      security: [],
      accessibility: [],
      reliability: [],
      maintainability: []
    },
    edgeCases: [],
    assumptions: [],
    outOfScope: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("readSpecArtifactWithNormalization", () => {
  let tempDir: string;
  let specPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-spec-artifact-"));
    specPath = path.join(tempDir, "spec.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function write(value: unknown): Promise<void> {
    await writeFile(specPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  it("mirrors a criterion stated in only one list and reports the change", async () => {
    await write(specWith({ topLevel: [], nested: [criterion] }));

    const result = await readSpecArtifactWithNormalization({
      artifactPath: specPath,
      displayPath: "spec.json",
      dryRun: false,
      writeNormalized: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the spec to be readable.");
    expect(result.value.value.acceptanceCriteria.map((entry) => entry.id)).toEqual(["AC001"]);
  });

  // Both declarations parse — they sit in different arrays, so no schema can see
  // the disagreement. A spec that says two things about AC001 is malformed, and
  // a malformed strict contract fails closed rather than being repaired into one
  // of the two things it might have meant.
  it("refuses a spec that declares one criterion id two different ways", async () => {
    await write(
      specWith({
        topLevel: [criterion],
        nested: [{ ...criterion, description: "Pinned notes appear last." }]
      })
    );

    const result = await readSpecArtifactWithNormalization({
      artifactPath: specPath,
      displayPath: "spec.json",
      dryRun: false,
      writeNormalized: false
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the conflicting spec to be refused.");
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.message).toContain("AC001");
    expect(result.error.message).toContain("must name exactly one criterion");
  });

  it("never rewrites a spec it refused, even when asked to normalize in place", async () => {
    const conflicted = specWith({
      topLevel: [criterion],
      nested: [{ ...criterion, description: "Pinned notes appear last." }]
    });
    await write(conflicted);
    const before = await readFile(specPath, "utf8");

    const result = await readSpecArtifactWithNormalization({
      artifactPath: specPath,
      displayPath: "spec.json",
      dryRun: false,
      writeNormalized: true
    });

    expect(result.ok).toBe(false);
    expect(await readFile(specPath, "utf8")).toBe(before);
  });

  it("reports the conflict as a validation error rather than a warning", async () => {
    await write(
      specWith({
        topLevel: [criterion],
        nested: [{ ...criterion, testable: false }]
      })
    );

    const result = await validateSpecArtifactWithNormalization({
      artifactPath: specPath,
      displayPath: "spec.json",
      dryRun: false,
      writeNormalized: false
    });

    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.errors.join("\n")).toContain("AC001");
  });
});
