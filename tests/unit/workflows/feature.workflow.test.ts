import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readArtifact } from "../../../src/artifacts/artifact-reader.js";
import { featureIntentSchema } from "../../../src/artifacts/schemas/feature.schema.js";
import { projectStatusSchema } from "../../../src/artifacts/schemas/project.schema.js";
import { pathExists } from "../../../src/core/file-system.js";
import { isErr } from "../../../src/core/result.js";
import { runFeatureWorkflow } from "../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function initializedProject(tempDir: string): Promise<void> {
  expectOk(
    await runInitWorkflow({
      targetPath: tempDir,
      agent: "none",
      preset: "typescript",
      budget: "balanced",
      now: "2026-01-01T00:00:00.000Z"
    })
  );
}

describe("runFeatureWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-feature-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates intent artifacts and updates status", async () => {
    await initializedProject(tempDir);

    const summary = expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning",
        budget: "lean",
        risk: "medium",
        now: "2026-01-02T00:00:00.000Z"
      })
    );

    expect(summary.feature).toMatchObject({
      id: "001",
      slug: "add-note-pinning",
      status: "draft",
      budgetMode: "lean",
      riskLevel: "medium"
    });
    expect(summary.createdFiles).toEqual([
      ".visp/features/001-add-note-pinning/intent.md",
      ".visp/features/001-add-note-pinning/intent.json"
    ]);
    expect(summary.updatedFiles).toEqual(
      expect.arrayContaining([
        ".visp/status.json",
        ".visp/features/001-add-note-pinning/timeline.json",
        ".visp/features/001-add-note-pinning/timeline.md"
      ])
    );

    const intent = expectOk(
      await readArtifact(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "intent.json"
        ),
        featureIntentSchema
      )
    );

    expect(intent.rawUserRequest).toBe("Add note pinning");
    expect(intent.createdAt).toBe("2026-01-02T00:00:00.000Z");

    const status = expectOk(
      await readArtifact(
        path.join(tempDir, ".visp", "status.json"),
        projectStatusSchema
      )
    );

    expect(status).toMatchObject({
      activeFeatureId: "001",
      activeFeatureSlug: "add-note-pinning",
      activeFeaturePath: ".visp/features/001-add-note-pinning",
      currentState: "feature_intent_ready",
      lastCommand: "feature"
    });
  });

  it("creates sequential feature IDs for different feature slugs", async () => {
    await initializedProject(tempDir);

    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning"
      })
    );
    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Export notes as PDF"
      })
    );
    const third = expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add local sync"
      })
    );

    expect(third.feature.id).toBe("003");
    expect(await exists(path.join(tempDir, ".visp", "features", "002-export-notes-as-pdf"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "features", "003-add-local-sync"))).toBe(true);
  });

  it("uses config budget and default risk when flags are omitted", async () => {
    await initializedProject(tempDir);

    const summary = expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning"
      })
    );

    expect(summary.feature.budgetMode).toBe("balanced");
    expect(summary.feature.riskLevel).toBe("medium");
  });

  it("fails clearly when .visp is missing", async () => {
    const result = await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "Add note pinning"
    });

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.message).toContain("visp init");
    }
  });

  it("fails when the feature title has no supported slug characters", async () => {
    await initializedProject(tempDir);

    const result = await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "!!!"
    });

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.message).toContain("supported letter or number");
    }
  });

  it("does not overwrite an existing generated feature without force", async () => {
    await initializedProject(tempDir);

    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning"
      })
    );

    const result = await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "Add note pinning"
    });

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.message).toContain("already exists");
    }
  });

  it("overwrites only generated intent files with force", async () => {
    await initializedProject(tempDir);

    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning"
      })
    );

    const featureDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning"
    );
    await writeFile(path.join(featureDir, "custom.md"), "keep me", "utf8");
    await writeFile(path.join(featureDir, "intent.md"), "old intent", "utf8");

    const summary = expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning",
        force: true,
        risk: "high"
      })
    );

    expect(summary.overwrittenFiles).toContain(
      ".visp/features/001-add-note-pinning/intent.md"
    );
    expect(await readFile(path.join(featureDir, "custom.md"), "utf8")).toBe(
      "keep me"
    );
    expect(await readFile(path.join(featureDir, "intent.md"), "utf8")).toContain(
      "# Feature Intent: Add note pinning"
    );
  });

  it("dry-run writes nothing", async () => {
    await initializedProject(tempDir);

    const summary = expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Dry run feature",
        dryRun: true
      })
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.createdFiles).toContain(
      ".visp/features/001-dry-run-feature/intent.md"
    );
    expect(await exists(path.join(tempDir, ".visp", "features", "001-dry-run-feature"))).toBe(false);
  });

  it("recreates a missing status artifact when schema allows it", async () => {
    await initializedProject(tempDir);
    await rm(path.join(tempDir, ".visp", "status.json"));

    const summary = expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning"
      })
    );

    expect(summary.updatedFiles).toContain(".visp/status.json");
    expect(await exists(path.join(tempDir, ".visp", "status.json"))).toBe(true);
  });

  it("fails clearly for conflicting branch flags", async () => {
    await initializedProject(tempDir);

    const result = await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "Add note pinning",
      branch: true,
      noBranch: true
    });

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.message).toContain("--branch");
    }
  });
});
