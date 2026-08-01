import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createArtifactReader } from "../../../src/artifacts/public.js";
import { validReviewReport } from "./fixtures.js";

describe("task review artifact accessor", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-task-review-accessor-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads a validated task review from its canonical path", async () => {
    const featureKey = "001-note-pinning";
    const taskId = "T001";
    const artifactPath = path.join(
      tempDir,
      ".visp",
      "features",
      featureKey,
      "review",
      `${taskId}.review.json`
    );
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(validReviewReport), "utf8");

    const result = await createArtifactReader(tempDir).taskReview(featureKey, taskId);

    expect(result.state).toBe("present");
    if (result.state === "present") {
      expect(result.path).toBe(artifactPath);
      expect(result.value).toEqual(validReviewReport);
      expect(result.value.taskId).toBe(taskId);
    }
  });

  it("returns missing with the canonical expected task review path", async () => {
    const featureKey = "001-note-pinning";
    const taskId = "T404";
    const artifactPath = path.join(
      tempDir,
      ".visp",
      "features",
      featureKey,
      "review",
      `${taskId}.review.json`
    );

    expect(await createArtifactReader(tempDir).taskReview(featureKey, taskId)).toEqual({
      state: "missing",
      path: artifactPath,
      reason: `Artifact is missing at ${artifactPath}.`
    });
  });

  it.each([
    ["feature key", "../escape", "T001", /Feature key must be one safe path segment/u],
    ["task ID", "001-note-pinning", "../../escape", /Task ID must be one safe path segment/u]
  ])("rejects a traversing %s before reading", (_label, featureKey, taskId, expected) => {
    expect(() => createArtifactReader(tempDir).taskReview(featureKey, taskId)).toThrow(expected);
  });
});
